"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { parseQuickLines, toQuickInsert } from "@/lib/quickAdd";

/**
 * 업무지시 알맹이 — 붙여넣으면 그 자리에서 이름·기한을 찾아 건별로 정리한다.
 *
 * 업무지시 화면(왼쪽 메뉴)과 업무 화면의 빠른 등록 팝업이 이것을 같이 쓴다.
 * 같은 일을 두 군데에 따로 만들면 한쪽만 고쳐지는 사고가 난다.
 *
 * 이름이 확실치 않으면 제멋대로 정하지 않고 노란 표시를 띄운다.
 * 업무는 사람에게 붙는 것이라 잘못 붙은 한 건이 오래 간다.
 */
export default function QuickAssignForm({
  members,
  createdBy,
  instructorDefault,
  layout = "modal",
  onDone,
}: {
  members: Profile[];
  createdBy: string;
  instructorDefault?: string | null;
  /** page = 좌우로 넓게, modal = 위아래로 */
  layout?: "page" | "modal";
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
  const [warn, setWarn] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const memberList = useMemo(() => members.map((m) => ({ id: m.id, name: m.name })), [members]);

  // 글자가 바뀌는 즉시 다시 정리한다
  const rows = useMemo(
    () =>
      parseQuickLines(text, memberList).map((r) => ({
        ...r,
        assigneeId: picked[r.raw] !== undefined ? picked[r.raw] || null : r.assigneeId,
      })),
    [text, memberList, picked]
  );

  const toAdd = rows.filter((r) => !dropped[r.raw]);
  const missing = toAdd.filter((r) => !r.assigneeId).length;
  const wide = layout === "page";

  async function save() {
    setSaving(true);
    setError(null);
    setWarn(null);
    setSaved(null);

    // 무슨 일이 생겨도 버튼이 "등록 중..."에 묶여 죽지 않도록 통째로 감싼다.
    // 전에 이 보호가 없어서, 실패했는데 화면이 아무 말도 안 하고 버튼만 안 먹었다.
    try {
      const supabase = createClient();

      // 지시 원문을 먼저 남긴다. 원문 보관이 안 돼도 업무 등록은 진행한다.
      let batchId: string | null = null;
      const { data: batch, error: batchErr } = await supabase
        .from("assign_batches")
        .insert({ content: text, created_by: createdBy, task_count: toAdd.length })
        .select("id")
        .single();
      if (batchErr)
        setWarn(`지시 원문 보관은 실패했습니다 (${batchErr.message}). 업무는 등록합니다.`);
      else batchId = (batch as { id: string }).id;

      const payload = toAdd.map((r) => ({
        ...toQuickInsert(r, createdBy, {
          instructor: instructor.trim() || null,
          dueDate: dueDate || null,
        }),
        ...(batchId ? { batch_id: batchId } : {}),
      }));

      const { error: err } = await supabase.from("tasks").insert(payload);
      if (err) {
        setError(`등록에 실패했습니다: ${err.message}`);
        return;
      }

      setSaved(payload.length);
      setText("");
      setPicked({});
      setDropped({});
      onDone(payload.length);
    } catch (e) {
      setError(`등록 중 문제가 생겼습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const preview = (
    <>
      {rows.length === 0 && text.trim().length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 mb-3">
          <p className="text-sm font-medium text-amber-800 break-keep">
            이 글에서는 업무를 못 찾았습니다.
          </p>
          <p className="text-xs text-amber-700 mt-1 break-keep">
            줄바꿈으로 한 건씩 나누거나, 글머리표(-)나 번호(1. 2.)를 붙여주시면 나눠집니다.
            아래 버튼으로 이 글 전체를 한 건으로 넣을 수도 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setText(text.trim() + " - ")}
            className="text-xs mt-2 px-2.5 py-1.5 rounded-lg border border-amber-400 text-amber-800 bg-white hover:bg-amber-100"
          >
            이 글 끝에 &quot; - &quot; 붙여 담당자 지정하기
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-xs text-gray-400 break-keep">
          이런 것도 읽습니다 — 업무 - 안윤환 · (담당 이준호 책임, 기한 9/17까지) · 1. 2. 3. 번호
          매김(한 줄에 붙어 있어도 나눕니다) · 강신준 매니저 · 여러 명(첫 사람이 담당, 나머지는
          참여자)
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-sm font-semibold text-gray-700">정리된 업무 {toAdd.length}건</p>
            {missing > 0 && (
              <p className="text-xs text-amber-700 font-medium">담당자 없음 {missing}건</p>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {rows.map((r) => {
              const out = !!dropped[r.raw];
              const hasWarn = r.warnings.length > 0;
              const deputies = r.deputyIds
                .map((id) => members.find((m) => m.id === id)?.name)
                .filter(Boolean);
              return (
                <div
                  key={r.raw}
                  className={`border-b border-gray-100 last:border-b-0 px-3 py-2.5 ${
                    out ? "bg-gray-50 opacity-50" : hasWarn ? "bg-amber-50/60" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={!out}
                      onChange={(e) => setDropped((p) => ({ ...p, [r.raw]: !e.target.checked }))}
                      className="w-4 h-4 mt-1.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 break-keep">{r.title}</p>
                      {(deputies.length > 0 || r.dueDate) && (
                        <p className="text-xs text-gray-500">
                          {r.dueDate && (
                            <span className="text-blue-700">기한 {r.dueDate.slice(5)}</span>
                          )}
                          {r.dueDate && deputies.length > 0 && " · "}
                          {deputies.length > 0 && `참여 ${deputies.join(", ")}`}
                        </p>
                      )}
                      {hasWarn && (
                        <p className="text-xs text-amber-700 break-keep">
                          {r.warnings.join(" · ")}
                        </p>
                      )}
                    </div>
                    <select
                      value={r.assigneeId ?? ""}
                      onChange={(e) => setPicked((p) => ({ ...p, [r.raw]: e.target.value }))}
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
              진행일정 (기한 못 읽은 건만)
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
    </>
  );

  return (
    <div className={wide ? "grid md:grid-cols-2 gap-4" : ""}>
      <div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          placeholder={
            "청소대차 진행보고 - 안윤환\n에어드레인 용량 조사 보고 - 안윤환\n발루프센서 배선 확인 체크시트 추가 보고 - 안윤환"
          }
          className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-relaxed ${
            wide ? "h-60 md:h-[26rem]" : "h-36 md:h-40"
          }`}
        />
        {wide && (
          <p className="text-xs text-gray-400 mt-1.5 break-keep">
            지시 원문은 그대로 보관됩니다. 업무명이 잘못 잡혔으면 이 글을 고치면 오른쪽도 따라
            바뀝니다.
          </p>
        )}
      </div>

      <div className={wide ? "" : "mt-3"}>
        {preview}

        {warn && <p className="text-sm text-amber-700 mt-2 break-keep">{warn}</p>}
        {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}

        {saved !== null && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 mt-3">
            <p className="text-sm font-medium text-emerald-800">
              {saved}건을 등록했습니다.
            </p>
            <Link
              href="/tasks"
              className="inline-block text-xs mt-2 px-2.5 py-1.5 rounded-lg border border-emerald-400 text-emerald-800 bg-white hover:bg-emerald-100"
            >
              업무관리에서 보기 →
            </Link>
          </div>
        )}

        <button
          onClick={save}
          disabled={saving || toAdd.length === 0}
          className="w-full mt-3 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving
            ? "등록 중..."
            : toAdd.length > 0
              ? `${toAdd.length}건 지시 등록`
              : text.trim()
                ? "읽을 업무가 없습니다"
                : "글을 붙여넣어 주세요"}
        </button>
        <p className="text-xs text-gray-400 mt-2 text-center break-keep">
          등록하면 각 담당자 화면에 새 업무로 뜨고, 확인을 눌러야 신규 표시가 없어집니다.
        </p>
      </div>
    </div>
  );
}
