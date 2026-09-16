"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Profile, TaskHistory, TaskWithEffectiveStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { isManager, isAssignable } from "@/lib/roles";
import { useUnsavedChanges } from "@/lib/useUnsavedChanges";

const HISTORY_LABELS: Record<string, string> = {
  created: "업무 생성",
  title: "제목 변경",
  description: "상세내용 변경",
  assignee_id: "담당자 변경",
  deputy_ids: "참여자 변경",
  instructor: "지시자 변경",
  note: "비고 변경",
  due_date: "마감일 변경",
  progress: "진행률 변경",
  status: "상태 변경",
};

export default function TaskDetail({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [task, setTask] = useState<TaskWithEffectiveStatus | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 편집 필드 (팀장 전용)
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [instructor, setInstructor] = useState("");
  const [note, setNote] = useState("");

  // 작성 중인 내용이 있으면 화면을 다시 불러와도 덮어쓰지 않는다
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);

  function markDirty() {
    dirtyRef.current = true;
    setDirty(true);
  }

  function clearDirty() {
    dirtyRef.current = false;
    setDirty(false);
  }

  useUnsavedChanges(dirty);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: profile }, { data: allProfiles }, { data: t }, { data: h }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      // 삭제된 팀원 이름도 이력에 그대로 표시되어야 하므로 전체를 불러온다
      supabase.from("profiles").select("*").order("name"),
      supabase.from("v_tasks").select("*").eq("id", taskId).single(),
      supabase
        .from("task_history")
        .select("*")
        .eq("task_id", taskId)
        .order("changed_at", { ascending: false }),
    ]);

    setMe(profile as Profile);
    setProfiles((allProfiles ?? []) as Profile[]);
    if (t) {
      const tt = t as TaskWithEffectiveStatus;
      setTask(tt);
      // 진행률 변경 등으로 화면을 다시 불러올 때, 작성 중이던 글은 그대로 둔다
      if (!dirtyRef.current) {
        setTitle(tt.title);
        setDescription(tt.description ?? "");
        setAssigneeId(tt.assignee_id ?? "");
        setDueDate(tt.due_date ?? "");
        setInstructor(tt.instructor ?? "");
        setNote(tt.note ?? "");
      }
    }
    setHistory((h ?? []) as TaskHistory[]);
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const isLead = isManager(me);
  const isAssignee = task?.assignee_id === me?.id;

  async function saveLeadEdits() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({
        title,
        description: description || null,
        assignee_id: assigneeId,
        due_date: dueDate || null,
        instructor: instructor.trim() || null,
        note: note.trim() || null,
      })
      .eq("id", taskId);
    if (error) {
      // 저장에 실패하면 쓰던 내용을 절대 날리지 않는다
      setError(error.message);
      setSaving(false);
      return;
    }
    clearDirty();
    await load();
    setSaving(false);
  }

  // 담당자가 비고만 저장하는 경우
  async function saveNoteOnly() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("tasks")
      .update({ note: note.trim() || null })
      .eq("id", taskId);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    clearDirty();
    await load();
    setSaving(false);
  }

  async function confirmNew() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("tasks").update({ confirmed_at: new Date().toISOString() }).eq("id", taskId);
    await load();
    setSaving(false);
  }

  async function updateProgress(progress: number) {
    setSaving(true);
    const supabase = createClient();
    const status = progress >= 100 ? "완료" : progress > 0 ? "진행중" : "대기";
    await supabase.from("tasks").update({ progress, status }).eq("id", taskId);
    await load();
    setSaving(false);
  }

  async function reopenTask() {
    setSaving(true);
    const supabase = createClient();
    await supabase.from("tasks").update({ status: "진행중", progress: 90 }).eq("id", taskId);
    await load();
    setSaving(false);
  }

  async function deleteTask() {
    if (!confirm("이 업무를 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("tasks").delete().eq("id", taskId);
    router.push("/tasks");
  }

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>;
  if (!task) return <p className="text-sm text-gray-400">업무를 찾을 수 없습니다.</p>;

  const canEditProgress = isAssignee || isLead;

  return (
    <div className="max-w-2xl space-y-6">
      <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-gray-800">
        ← 목록으로
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {task.is_new && (
            <span className="text-[10px] font-bold text-white bg-blue-500 px-1.5 py-0.5 rounded">신규</span>
          )}
          <StatusBadge status={task.effective_status} />
        </div>

        {isLead ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">제목</label>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); markDirty(); }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">상세내용</label>
              <textarea
                value={description}
                onChange={(e) => { setDescription(e.target.value); markDirty(); }}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">담당자</label>
                <select
                  value={assigneeId}
                  onChange={(e) => { setAssigneeId(e.target.value); markDirty(); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                >
                  {profiles
                    .filter((p) => isAssignable(p) || p.id === task.assignee_id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.status === "삭제" ? " (삭제된 계정)" : ""}
                        {p.status === "가입대기" ? " (가입대기)" : ""}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">마감일</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); markDirty(); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">지시자</label>
                <input
                  value={instructor}
                  onChange={(e) => { setInstructor(e.target.value); markDirty(); }}
                  placeholder="예: 공장장, 대표"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">비고</label>
                <input
                  value={note}
                  onChange={(e) => { setNote(e.target.value); markDirty(); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={saveLeadEdits}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
              {dirty && (
                <span className="text-xs text-amber-600 font-medium">
                  저장하지 않은 변경이 있습니다
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{task.title}</h1>
              {task.description && (
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                진행일정(마감일): {formatDate(task.due_date)}
                {task.instructor && <> · 지시자: {task.instructor}</>}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">비고</label>
              <input
                value={note}
                onChange={(e) => { setNote(e.target.value); markDirty(); }}
                placeholder="진행하면서 남길 메모"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
              />
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <button
                  onClick={saveNoteOnly}
                  disabled={saving || !dirty}
                  className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
                >
                  {saving ? "저장 중..." : "비고 저장"}
                </button>
                {dirty && (
                  <span className="text-xs text-amber-600 font-medium">
                    저장하지 않은 변경이 있습니다
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">진행률</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={task.progress}
              disabled={!canEditProgress || saving}
              onChange={(e) => updateProgress(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-medium w-10 text-right">{task.progress}%</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {task.is_new && isAssignee && (
            <button
              onClick={confirmNew}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-black disabled:opacity-50"
            >
              확인했습니다
            </button>
          )}
          {canEditProgress && task.status !== "완료" && (
            <button
              onClick={() => updateProgress(100)}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              완료처리
            </button>
          )}
          {canEditProgress && task.status === "완료" && (
            <button
              onClick={reopenTask}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              진행중으로 되돌리기
            </button>
          )}
          {isLead && (
            <button
              onClick={deleteTask}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg border border-red-200 text-red-600 font-medium hover:bg-red-50 disabled:opacity-50 ml-auto"
            >
              삭제
            </button>
          )}
        </div>

        {task.completed_at && (
          <p className="text-xs text-gray-400">완료일: {formatDateTime(task.completed_at)}</p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">변경 이력</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {history.map((h) => (
            <div key={h.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-700">{HISTORY_LABELS[h.field_name] ?? h.field_name}</span>
                <span className="text-xs text-gray-400">{formatDateTime(h.changed_at)}</span>
              </div>
              {h.field_name !== "created" && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {h.old_value ?? "(없음)"} → {h.new_value ?? "(없음)"}
                </p>
              )}
            </div>
          ))}
          {history.length === 0 && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">변경 이력이 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
