"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { parseQuickLines, toQuickInsert, type QuickRow } from "@/lib/quickAdd";

/**
 * 빠른 등록 — 적어둔 대로 붙여넣으면 이름을 찾아 각자에게 붙인다.
 *
 *   청소대차 진행보고 - 안윤환
 *   에어드레인 용량 조사 보고 - 안윤환
 *
 * 이름이 확실치 않으면 제멋대로 정하지 않고 노란 표시를 띄운다.
 * 등록 전에 담당자를 바꿀 수 있고, 뺄 줄은 체크를 풀면 된다.
 */
export default function QuickAddModal({
  members,
  createdBy,
  instructorDefault,
  onClose,
  onDone,
}: {
  members: Profile[];
  createdBy: string;
  instructorDefault?: string | null;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<"paste" | "check">("paste");
  const [rows, setRows] = useState<QuickRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [instructor, setInstructor] = useState(instructorDefault ?? "");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberList = useMemo(() => members.map((m) => ({ id: m.id, name: m.name })), [members]);

  function analyze() {
    const parsed = parseQuickLines(text, memberList);
    if (parsed.length === 0) {
      setError("읽을 줄이 없습니다. 한 줄에 한 건씩 적어주세요.");
      return;
    }
    setError(null);
    setRows(parsed);
    setExcluded(new Set());
    setStep("check");
  }

  function setAssignee(i: number, id: string) {
    setRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, assigneeId: id || null } : r))
    );
  }

  function setTitle(i: number, title: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, title } : r)));
  }

  const toAdd = rows.filter((_, i) => !excluded.has(i));
  const missing = toAdd.filter((r) => !r.assigneeId).length;

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = toAdd.map((r) =>
      toQuickInsert(r, createdBy, {
        instructor: instructor.trim() || null,
        dueDate: dueDate || null,
      })
    );

    const { error: err } = await supabase.from("tasks").insert(payload);
    setSaving(false);
    if (err) {
      setError(`등록에 실패했습니다: ${err.message}`);
      return;
    }
    onDone(payload.length);
  }

  return (
    <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-start md:items-center justify-center p-0 md:p-4 overflow-y-auto">
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl p-4 md:p-5 md:my-4 min-h-dvh md:min-h-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-lg font-bold text-gray-900">빠른 등록</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
            title="닫기"
          >
            ×
          </button>
        </div>

        {step === "paste" && (
          <>
            <p className="text-sm text-gray-500 mb-3 break-keep">
              한 줄에 한 건씩, <strong>업무 - 이름</strong> 으로 적어주세요. 이름은 팀원 명단에서
              찾아 붙입니다.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "청소대차 진행보고 - 안윤환\n에어드레인 용량 조사 보고 - 안윤환\n발루프센서 배선 확인 체크시트 추가 보고 - 안윤환"
              }
              className="w-full h-56 md:h-64 rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-relaxed"
            />
            <p className="text-xs text-gray-400 mt-2 break-keep">
              이런 것도 읽습니다 — 1. 번호 매김 · (안윤환) · 담당 안윤환 · 강신준 매니저 ·
              여러 명(강신준, 이준호 → 첫 사람이 담당, 나머지는 참여자)
            </p>

            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

            <div className="flex gap-2 pt-4">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={analyze}
                disabled={!text.trim()}
                className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                이름 찾기
              </button>
            </div>
          </>
        )}

        {step === "check" && (
          <>
            <p className="text-sm text-gray-500 mb-3 break-keep">
              {rows.length}건을 읽었습니다. 담당자를 확인하고 등록하세요.
              {missing > 0 && (
                <span className="text-amber-700 font-medium"> · 담당자 없는 줄 {missing}건</span>
              )}
            </p>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {rows.map((r, i) => {
                const out = excluded.has(i);
                const warn = r.warnings.length > 0;
                return (
                  <div
                    key={i}
                    className={`border-b border-gray-100 last:border-b-0 px-3 py-2.5 ${
                      out ? "bg-gray-50 opacity-50" : warn ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={!out}
                        onChange={(e) => {
                          const next = new Set(excluded);
                          if (e.target.checked) next.delete(i);
                          else next.add(i);
                          setExcluded(next);
                        }}
                        className="w-4 h-4 mt-2 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <input
                          value={r.title}
                          onChange={(e) => setTitle(i, e.target.value)}
                          className="w-full rounded border border-transparent hover:border-gray-300 focus:border-gray-400 px-1.5 py-1 text-sm font-medium text-gray-900 bg-transparent"
                        />
                        {warn && (
                          <p className="text-xs text-amber-700 px-1.5 break-keep">
                            {r.warnings.join(" · ")}
                          </p>
                        )}
                      </div>
                      <select
                        value={r.assigneeId ?? ""}
                        onChange={(e) => setAssignee(i, e.target.value)}
                        className={`shrink-0 w-32 rounded-lg border px-2 py-1.5 text-sm ${
                          r.assigneeId
                            ? "border-gray-300 text-gray-900"
                            : "border-amber-400 text-amber-700 bg-amber-50"
                        }`}
                      >
                        <option value="">담당자 선택</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <label className="text-xs text-gray-500">
                지시자 (전체 공통)
                <input
                  value={instructor}
                  onChange={(e) => setInstructor(e.target.value)}
                  placeholder="예: 공장장"
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 mt-1"
                />
              </label>
              <label className="text-xs text-gray-500">
                진행일정 (전체 공통, 비워도 됩니다)
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 mt-1"
                />
              </label>
            </div>

            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

            <div className="flex gap-2 pt-4">
              <button
                onClick={() => setStep("paste")}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                뒤로
              </button>
              <button
                onClick={save}
                disabled={saving || toAdd.length === 0}
                className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "등록 중..." : `${toAdd.length}건 등록`}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              등록하면 각 담당자 화면에 새 업무로 뜨고, 확인을 눌러야 신규 표시가 없어집니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
