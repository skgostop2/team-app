"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  FIELD_LABELS,
  buildRows,
  guessMapping,
  looksLikeHeader,
  splitPasted,
  toInsert,
  type FieldKey,
  type ParsedRow,
} from "@/lib/importTasks";

/**
 * 엑셀에서 복사한 업무를 우리 양식으로 옮긴다.
 *
 * 붙여넣기 → 자동으로 칸 짝짓기 → 미리보기에서 확인 → 등록.
 * 미리보기에서 사람이 누르기 전까지는 아무것도 저장되지 않는다.
 */
export default function ImportTasksModal({
  members,
  createdBy,
  onClose,
  onDone,
}: {
  members: Profile[];
  createdBy: string;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  const [text, setText] = useState("");
  const [step, setStep] = useState<"paste" | "check">("paste");
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<FieldKey[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [existing, setExisting] = useState<{ title: string; created_at: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const memberList = useMemo(() => members.map((m) => ({ id: m.id, name: m.name })), [members]);

  async function analyze() {
    setError(null);
    const parsed = splitPasted(text);
    if (parsed.length === 0) {
      setError("붙여넣은 내용이 없습니다.");
      return;
    }

    const header = looksLikeHeader(parsed[0]);
    const supabase = createClient();
    const { data } = await supabase.from("tasks").select("title, created_at");

    setExisting((data ?? []) as { title: string; created_at: string }[]);
    setRows(parsed);
    setHasHeader(header);
    setMapping(guessMapping(parsed, header, memberList.map((m) => m.name)));
    setExcluded(new Set());
    setStep("check");
  }

  const parsedRows: ParsedRow[] = useMemo(() => {
    if (rows.length === 0) return [];
    return buildRows(rows, hasHeader, mapping, memberList, existing).map((r) => ({
      ...r,
      include: r.include && !excluded.has(r.line),
    }));
  }, [rows, hasHeader, mapping, memberList, existing, excluded]);

  const toAdd = parsedRows.filter((r) => r.include);
  const warned = parsedRows.filter((r) => r.include && r.warnings.length > 0);
  const skipped = parsedRows.filter((r) => !r.include);
  const noTitleCol = !mapping.includes("title");

  async function save() {
    if (toAdd.length === 0) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    // 한 번에 다 넣으면 한 줄만 틀려도 전부 실패하므로 50건씩 나눠 넣는다
    let done = 0;
    for (let i = 0; i < toAdd.length; i += 50) {
      const chunk = toAdd.slice(i, i + 50).map((r) => toInsert(r, createdBy));
      const { error: err } = await supabase.from("tasks").insert(chunk);
      if (err) {
        setError(`${done}건까지 등록했고 그다음에서 막혔습니다: ${err.message}`);
        setSaving(false);
        if (done > 0) onDone(done);
        return;
      }
      done += chunk.length;
    }

    setSaving(false);
    onDone(done);
  }

  return (
    <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-start md:items-center justify-center p-0 md:p-4 overflow-y-auto">
      <div className="bg-white w-full md:max-w-4xl md:rounded-2xl p-4 md:p-5 md:my-4 min-h-dvh md:min-h-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-lg font-bold text-gray-900">엑셀에서 업무 가져오기</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {step === "paste" && (
          <>
            <p className="text-sm text-gray-500 mb-3 break-keep">
              엑셀에서 <strong>제목 줄까지 포함해</strong> 범위를 잡아 복사(Ctrl+C)한 뒤 아래에
              붙여넣기(Ctrl+V) 하십시오. 제목 줄이 없어도 내용을 보고 짝지어 드립니다.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "작성일\t업무내용\t진행일정\t담당자\t지시자\n2026-06-08\t튜브히터 증설 견적요청\t6/20\t강신준\t공장장"
              }
              className="w-full h-60 md:h-72 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-mono"
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            <div className="flex gap-2 pt-3">
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
                다음 (내용 확인)
              </button>
            </div>
          </>
        )}

        {step === "check" && (
          <>
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 mb-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => {
                    setHasHeader(e.target.checked);
                    setMapping(
                      guessMapping(rows, e.target.checked, memberList.map((m) => m.name))
                    );
                  }}
                  className="w-4 h-4"
                />
                첫 줄은 제목 줄입니다 (업무가 아님)
              </label>

              <div>
                <p className="text-xs text-gray-500 mb-1.5">
                  각 칸이 우리 양식의 어디에 들어갈지입니다. 틀린 게 있으면 바꿔주십시오.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {mapping.map((key, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-28 shrink-0 truncate">
                        {hasHeader && rows[0]?.[i]
                          ? rows[0][i]
                          : `${i + 1}번째 칸`}
                      </span>
                      <select
                        value={key}
                        onChange={(e) => {
                          const next = [...mapping];
                          const picked = e.target.value as FieldKey;
                          // 같은 항목을 두 칸에 지정하지 못하게 한다
                          if (picked !== "ignore") {
                            for (let j = 0; j < next.length; j++) {
                              if (j !== i && next[j] === picked) next[j] = "ignore";
                            }
                          }
                          next[i] = picked;
                          setMapping(next);
                        }}
                        className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        {(Object.keys(FIELD_LABELS) as FieldKey[]).map((k) => (
                          <option key={k} value={k}>
                            {FIELD_LABELS[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {noTitleCol && (
              <p className="text-sm text-red-600 mb-2">
                업무내용(제목) 칸을 지정해야 등록할 수 있습니다.
              </p>
            )}

            <p className="text-sm mb-2">
              <strong className="text-gray-900">{toAdd.length}건 등록 예정</strong>
              {warned.length > 0 && (
                <span className="text-amber-600"> · 확인 필요 {warned.length}건</span>
              )}
              {skipped.length > 0 && (
                <span className="text-gray-400"> · 제외 {skipped.length}건</span>
              )}
            </p>

            <div className="border border-gray-200 rounded-lg overflow-auto max-h-[45dvh]">
              <table className="w-full text-xs border-collapse min-w-[720px]">
                <thead className="bg-blue-50 sticky top-0">
                  <tr className="text-gray-700">
                    <th className="px-2 py-1.5 border-b border-gray-300 w-10">등록</th>
                    <th className="px-2 py-1.5 border-b border-gray-300 w-24 text-left">작성일</th>
                    <th className="px-2 py-1.5 border-b border-gray-300 text-left">업무내용</th>
                    <th className="px-2 py-1.5 border-b border-gray-300 w-24 text-left">담당자</th>
                    <th className="px-2 py-1.5 border-b border-gray-300 w-20 text-left">진행일정</th>
                    <th className="px-2 py-1.5 border-b border-gray-300 w-20 text-left">완료일</th>
                    <th className="px-2 py-1.5 border-b border-gray-300 w-14">진행률</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r) => (
                    <tr
                      key={r.line}
                      className={cn(
                        "border-b border-gray-100",
                        !r.include && "bg-gray-50 text-gray-400",
                        r.include && r.warnings.length > 0 && "bg-amber-50"
                      )}
                    >
                      <td className="px-2 py-1.5 text-center align-top">
                        <input
                          type="checkbox"
                          checked={r.include}
                          disabled={!r.title || r.duplicate}
                          onChange={(e) => {
                            const next = new Set(excluded);
                            if (e.target.checked) next.delete(r.line);
                            else next.add(r.line);
                            setExcluded(next);
                          }}
                          className="w-3.5 h-3.5"
                        />
                      </td>
                      <td className="px-2 py-1.5 align-top whitespace-nowrap">
                        {r.createdAt ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <span className="break-keep">{r.title || "(비어 있음)"}</span>
                        {r.warnings.length > 0 && (
                          <ul className="mt-0.5 space-y-0.5">
                            {r.warnings.map((w, k) => (
                              <li key={k} className="text-[11px] text-amber-700 break-keep">
                                · {w}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        {r.assigneeId ? (
                          memberList.find((m) => m.id === r.assigneeId)?.name
                        ) : r.assigneeName ? (
                          <span className="text-amber-700">{r.assigneeName} → 미지정</span>
                        ) : (
                          <span className="text-gray-300">미지정</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top whitespace-nowrap">
                        {r.dueDate ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 align-top whitespace-nowrap">
                        {r.completedAt ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-2 py-1.5 align-top text-center">
                        {r.progress ?? <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-gray-500 mt-2 break-keep">
              담당자를 못 찾은 줄은 <strong>미지정</strong>으로 들어갑니다. 등록 후 업무 목록의
              담당자 칸에서 체크하시면 됩니다. 엉뚱한 사람에게 배정하지 않기 위해 짐작하지
              않습니다.
            </p>

            {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}

            <div className="flex gap-2 pt-3">
              <button
                onClick={() => setStep("paste")}
                disabled={saving}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                뒤로
              </button>
              <button
                onClick={save}
                disabled={saving || toAdd.length === 0 || noTitleCol}
                className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "등록 중..." : `${toAdd.length}건 등록`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
