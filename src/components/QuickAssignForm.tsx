"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Link from "next/link";
import { parseQuickLines, toQuickInsert } from "@/lib/quickAdd";
import { findSimilar, findDuplicatesWithin, type SimilarTask } from "@/lib/similar";

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
  mode = "assign",
  existing = [],
  onDone,
}: {
  members: Profile[];
  createdBy: string;
  instructorDefault?: string | null;
  /** page = 좌우로 넓게, modal = 위아래로 */
  layout?: "page" | "modal";
  /**
   * assign = 팀장이 남에게 지시 (담당자를 고르고, 지시 원문을 보관한다)
   * self   = 팀원이 자기 업무를 등록 (담당자는 본인 고정, 지시 관련은 없다)
   */
  mode?: "assign" | "self";
  /** 이미 들어가 있는 업무 — 비슷한 건이 있으면 알려주기 위해 받는다 */
  existing?: SimilarTask[];
  onDone: (count: number) => void;
}) {
  const [text, setText] = useState("");
  /** 사람이 직접 고른 담당자 (원래 줄 글자를 열쇠로 둔다 — 글을 고쳐도 남아 있게) */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [dropped, setDropped] = useState<Record<string, boolean>>({});
  const [instructor, setInstructor] = useState(instructorDefault ?? "");
  const [dueDate, setDueDate] = useState("");
  /** 이 지시 전체를 긴급으로 (글에 「긴급」이라 적은 줄은 그것만으로도 긴급이 된다) */
  const [urgentAll, setUrgentAll] = useState(false);
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

  const self = mode === "self";

  // 자기 업무 등록에서는 글에 누구 이름이 적혀 있든 본인 것으로 넣는다.
  // 남에게 일을 넘기는 것은 지시이고, 그건 팀장 몫이다.
  const shaped = self
    ? rows.map((r) => ({ ...r, assigneeId: createdBy, deputyIds: [], warnings: [] }))
    : rows;

  /*
    비슷한 업무가 이미 있는지 본다. 막지 않고 알려만 준다 —
    1차/2차처럼 이름이 같아도 진짜 다른 건이 있다. 판단은 사람이 한다.
  */
  const similar = useMemo(
    () => shaped.map((r) => findSimilar(r.title, existing)),
    [shaped, existing]
  );
  /** 붙여넣은 글 안에서 서로 겹친 줄 (같은 지시문에 같은 줄이 두 번 들어가는 일이 잦다) */
  const dupWithin = useMemo(() => findDuplicatesWithin(shaped.map((r) => r.title)), [shaped]);

  const nameOfId = (id: string | null) =>
    members.find((m) => m.id === id)?.name ?? "담당자 미지정";

  const toAdd = shaped.filter((r) => !dropped[r.raw]);
  const missing = self ? 0 : toAdd.filter((r) => !r.assigneeId).length;
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

      // 지시 원문은 지시일 때만 남긴다. 원문 보관이 안 돼도 업무 등록은 진행한다.
      let batchId: string | null = null;
      if (!self) {
        const { data: batch, error: batchErr } = await supabase
          .from("assign_batches")
          .insert({ content: text, created_by: createdBy, task_count: toAdd.length })
          .select("id")
          .single();
        if (batchErr)
          setWarn(`지시 원문 보관은 실패했습니다 (${batchErr.message}). 업무는 등록합니다.`);
        else batchId = (batch as { id: string }).id;
      }

      const payload = toAdd.map((r) => ({
        ...toQuickInsert(r, createdBy, {
          instructor: self ? null : instructor.trim() || null,
          dueDate: dueDate || null,
          urgent: !self && urgentAll,
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

      {shaped.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <p className="text-sm font-semibold text-gray-700">
              {self ? "등록할 내 업무" : "정리된 업무"} {toAdd.length}건
            </p>
            {missing > 0 && (
              <p className="text-xs text-amber-700 font-medium">담당자 없음 {missing}건</p>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {shaped.map((r, ri) => {
              const out = !!dropped[r.raw];
              const sim = similar[ri] ?? [];
              const dupOf = dupWithin.get(ri);
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
                      <p className="text-sm font-medium text-gray-900 break-keep">
                        {(r.urgent || (!self && urgentAll)) && (
                          <span className="mr-1.5 align-middle text-[11px] px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">
                            긴급
                          </span>
                        )}
                        {r.title}
                      </p>
                      {r.description && (
                        <p className="text-xs text-gray-600 break-keep mt-0.5 whitespace-pre-wrap">
                          <span className="text-gray-400">세부 </span>
                          {r.description}
                        </p>
                      )}
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

                      {dupOf !== undefined && (
                        <p className="text-xs text-amber-800 bg-amber-100 rounded px-2 py-1 mt-1 break-keep">
                          ⚠ 이 글 안의 {dupOf + 1}번째 줄과 겹칩니다 —{" "}
                          <b>{shaped[dupOf].title}</b>
                        </p>
                      )}

                      {sim.length > 0 && (
                        <div className="text-xs text-amber-800 bg-amber-100 rounded px-2 py-1 mt-1 break-keep">
                          ⚠ 비슷한 업무가 이미 있습니다
                          {sim.map(({ task }) => (
                            <span key={task.id} className="block mt-0.5">
                              · {nameOfId(task.assignee_id)} · {task.title}
                              <span className="text-amber-700">
                                {task.due_date ? ` (기한 ${task.due_date.slice(5)}` : " ("}
                                {task.effective_status ?? ""})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!self && (
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
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={self ? "mt-3" : "grid grid-cols-2 gap-2 mt-3"}>
            {!self && (
            <label className="col-span-2 flex items-center gap-2 text-xs text-gray-700 border border-gray-300 rounded-lg px-3 py-2 cursor-pointer bg-white">
              <input
                type="checkbox"
                checked={urgentAll}
                onChange={(e) => setUrgentAll(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              이 지시 전체를 <b className="text-red-600">긴급</b>으로 (받는 사람 화면에서 위로 올라갑니다)
            </label>
            )}
            {!self && (
            <label className="text-xs text-gray-500">
              지시자 (전체 공통)
              <input
                value={instructor}
                onChange={(e) => setInstructor(e.target.value)}
                placeholder="예: 공장장"
                className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 mt-1"
              />
            </label>
            )}
            <label className="text-xs text-gray-500">
              완료계획일정 (기한 못 읽은 건만)
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
            self
              ? "여기에 할 일을 적으세요. 세부 내용은 괄호 안에.\n\n예시)\n청소대차 진행보고 (대차 수량 확인 후 사진 첨부해서 보고)\n에어드레인 용량 조사 (현 설비 기준으로 산출, 9/25까지)"
              : "여기에 지시 내용을 붙여넣으세요. 세부 내용은 괄호 안에.\n\n예시)\n청소대차 진행보고 - 안윤환 (대차 수량 확인 후 사진 첨부해서 보고)\n에어드레인 용량 조사 - 안윤환 (현 설비 기준으로 산출, 9/25까지)"
          }
          className={`w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-relaxed ${
            wide ? "h-60 md:h-[26rem]" : "h-36 md:h-40"
          }`}
        />
        {text.trim().length === 0 && (
          <button
            type="button"
            onClick={() =>
              setText(
                self
                  ? "청소대차 진행보고 (대차 수량 확인 후 사진 첨부해서 보고)\n에어드레인 용량 조사 (현 설비 기준으로 산출, 9/25까지)"
                  : "청소대차 진행보고 - 안윤환 (대차 수량 확인 후 사진 첨부해서 보고)\n에어드레인 용량 조사 보고 - 안윤환 (현 설비 기준으로 산출, 9/25까지)\n발루프센서 배선 확인 체크시트 추가 보고 - 안윤환"
              )
            }
            className="text-xs mt-2 px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"
          >
            예시로 한번 해보기
          </button>
        )}

        <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-2 break-keep">
          <b>세부 내용은 괄호 ( ) 안에 적으세요.</b> 괄호 안의 글은 제목이 아니라{" "}
          <b>업무 설명</b>으로 들어갑니다. 제목 한 줄만 있으면 받는 사람이 무엇을 어디까지 해야
          하는지 몰라 묻지도 못합니다. 괄호가 여러 줄이어도 괜찮습니다.
        </p>

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
              ? self
                ? `${toAdd.length}건 내 업무 등록`
                : `${toAdd.length}건 지시 등록`
              : text.trim()
                ? "읽을 업무가 없습니다"
                : "글을 붙여넣어 주세요"}
        </button>
        <p className="text-xs text-gray-400 mt-2 text-center break-keep">
          {self
            ? "등록하면 내 업무 목록에 바로 들어가고, 팀장 화면에도 팀원추가 업무로 표시됩니다."
            : "등록하면 각 담당자 화면에 새 업무로 뜨고, 확인을 눌러야 신규 표시가 없어집니다."}
        </p>
      </div>
    </div>
  );
}
