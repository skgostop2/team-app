"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { parseQuickLines, toQuickInsert } from "@/lib/quickAdd";

/**
 * 빠른 등록 — 적어둔 대로 붙여넣으면 그 자리에서 이름을 찾아 정리한다.
 *
 *   청소대차 진행보고 - 안윤환
 *   에어드레인 용량 조사 보고 - 안윤환
 *
 * 창은 하나다. 붙여넣는 즉시 아래에 정리된 결과가 뜨고, 등록만 누르면 된다.
 * 업무명이 잘못 잡혔으면 위 글을 고치면 아래도 따라 바뀐다.
 *
 * 이름이 확실치 않으면 제멋대로 정하지 않고 노란 표시를 띄운다.
 * 업무는 사람에게 붙는 것이라 잘못 붙은 한 건이 오래 간다.
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
  /** 사람이 직접 고른 담당자 (원래 줄 글자를 열쇠로 둔다 — 글을 고쳐도 남아 있게) */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [dropped, setDropped] = useState<Record<string, boolean>>({});
  const [instructor, setInstructor] = useState(instructorDefault ?? "");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberList = useMemo(() => members.map((m) => ({ id: m.id, name: m.name })), [members]);

  // 글자가 바뀌는 즉시 다시 정리한다
  const rows = useMemo(() => {
    return parseQuickLines(text, memberList).map((r) => ({
      ...r,
      assigneeId: picked[r.raw] !== undefined ? picked[r.raw] || null : r.assigneeId,
    }));
  }, [text, memberList, picked]);

  const toAdd = rows.filter((r) => !dropped[r.raw]);
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
        <p className="text-sm text-gray-500 mb-3 break-keep">
          한 줄에 한 건씩 <strong>업무 - 이름</strong> 으로 붙여넣으면 바로 정리됩니다.
        </p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder={
            "청소대차 진행보고 - 안윤환\n에어드레인 용량 조사 보고 - 안윤환\n발루프센서 배선 확인 체크시트 추가 보고 - 안윤환"
          }
          className="w-full h-36 md:h-40 rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-relaxed"
        />

        {rows.length === 0 && (
          <p className="text-xs text-gray-400 mt-2 break-keep">
            이런 것도 읽습니다 — 1. 번호 매김 · (안윤환) · 담당 안윤환 · 강신준 매니저 ·
            여러 명(강신준, 이준호 → 첫 사람이 담당, 나머지는 참여자)
          </p>
        )}

        {rows.length > 0 && (
          <>
            <div className="flex items-baseline justify-between mt-3 mb-1.5">
              <p className="text-sm font-semibold text-gray-700">
                정리된 업무 {toAdd.length}건
              </p>
              {missing > 0 && (
                <p className="text-xs text-amber-700 font-medium">담당자 없음 {missing}건</p>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {rows.map((r) => {
                const out = !!dropped[r.raw];
                const warn = r.warnings.length > 0;
                const deputies = r.deputyIds
                  .map((id) => members.find((m) => m.id === id)?.name)
                  .filter(Boolean);
                return (
                  <div
                    key={r.raw}
                    className={`border-b border-gray-100 last:border-b-0 px-3 py-2.5 ${
                      out ? "bg-gray-50 opacity-50" : warn ? "bg-amber-50/60" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={!out}
                        onChange={(e) =>
                          setDropped((p) => ({ ...p, [r.raw]: !e.target.checked }))
                        }
                        className="w-4 h-4 mt-1.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 break-keep">{r.title}</p>
                        {deputies.length > 0 && (
                          <p className="text-xs text-gray-500">참여 {deputies.join(", ")}</p>
                        )}
                        {warn && (
                          <p className="text-xs text-amber-700 break-keep">
                            {r.warnings.join(" · ")}
                          </p>
                        )}
                      </div>
                      <select
                        value={r.assigneeId ?? ""}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [r.raw]: e.target.value }))
                        }
                        className={`shrink-0 w-28 md:w-32 rounded-lg border px-2 py-1.5 text-sm ${
                          r.assigneeId
                            ? "border-gray-300 text-gray-900"
                            : "border-amber-400 text-amber-700 bg-amber-50"
                        }`}
                      >
                        <option value="">담당자</option>
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
                진행일정 (전체 공통)
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 mt-1"
                />
              </label>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 pt-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            닫기
          </button>
          <button
            onClick={save}
            disabled={saving || toAdd.length === 0}
            className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "등록 중..." : toAdd.length > 0 ? `${toAdd.length}건 등록` : "등록"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center break-keep">
          업무명이 잘못 잡혔으면 위 글을 고치면 아래도 따라 바뀝니다.
        </p>
      </div>
    </div>
  );
}
