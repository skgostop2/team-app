"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { confirmDiscard, useUnsavedChanges } from "@/lib/useUnsavedChanges";

export default function NewTaskModal({
  profiles,
  defaultInstructor = "",
  onClose,
  onCreated,
}: {
  profiles: Profile[];
  defaultInstructor?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState(profiles[0]?.id ?? "");
  const [instructor, setInstructor] = useState(defaultInstructor);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 쓰던 내용이 있는데 창을 닫으려 하면 되묻는다
  const dirty =
    !saving &&
    (title.trim() !== "" ||
      description.trim() !== "" ||
      note.trim() !== "" ||
      dueDate !== "" ||
      instructor.trim() !== defaultInstructor.trim());

  useUnsavedChanges(dirty);

  function handleClose() {
    if (confirmDiscard(dirty)) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("업무 제목을 입력해주세요.");
      return;
    }
    if (!assigneeId) {
      setError("담당자를 선택해주세요.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("tasks").insert({
      title: title.trim(),
      description: description.trim() || null,
      assignee_id: assigneeId,
      created_by: user?.id,
      instructor: instructor.trim() || null,
      note: note.trim() || null,
      due_date: dueDate || null,
      start_date: new Date().toISOString().slice(0, 10),
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900 mb-4">새 업무 지시</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">업무 제목</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="예: CG-7070 금형 점검"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상세 내용</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">담당자</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.role}){p.status === "가입대기" ? " · 가입대기" : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">지시자</label>
            <input
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="예: 공장장, 대표, 본인 이름"
            />
            <p className="text-xs text-gray-400 mt-1">
              시스템에 계정이 없는 분도 그대로 적으시면 됩니다.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">진행일정 (마감일)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비고</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "등록 중..." : "등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
