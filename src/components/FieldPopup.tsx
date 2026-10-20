"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DATE_MAX, DATE_MIN, fixYear, type DateVerdict } from "@/lib/dateCheck";

/**
 * 칸 하나만 고치는 작은 창.
 *
 * 표에서 그 칸을 누르면 이 창이 표 위에 뜬다. 화면을 옮기지 않으므로
 * 보던 자리를 잃지 않고, 칸 폭에 상관없이 넉넉하게 입력할 수 있다.
 *
 * 저장이 실패하면 창을 닫지 않고 입력한 내용을 그대로 둔다.
 */
export type FieldKind = "text" | "textarea" | "date" | "progress";

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026-10-20" → "2026년 10월 20일 (화)" */
function koreanDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const w = WEEKDAY[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${w})`;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** 자주 고르는 날짜 — 오늘, 내일, 이번 주 금요일, 다음 주 금요일 */
function quickDates(): { label: string; value: string }[] {
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // 금요일(5)까지 남은 날. 토·일이면 다음 주 금요일로 간다.
  const dow = today.getDay();
  const toFri = dow === 0 ? 5 : dow <= 5 ? 5 - dow : 6;
  const fri = new Date(today);
  fri.setDate(today.getDate() + toFri);

  const nextFri = new Date(fri);
  nextFri.setDate(fri.getDate() + 7);

  return [
    { label: "오늘", value: iso(today) },
    { label: "내일", value: iso(tomorrow) },
    { label: "이번 주 금요일", value: iso(fri) },
    { label: "다음 주 금요일", value: iso(nextFri) },
  ];
}

export default function FieldPopup({
  label,
  hint,
  kind,
  value,
  min,
  max,
  placeholder,
  onSave,
  onClose,
  extraAction,
  check,
}: {
  label: string;
  hint?: string;
  kind: FieldKind;
  /** date 는 YYYY-MM-DD, progress 는 "0"~"100", 나머지는 그대로 */
  value: string;
  min?: string;
  max?: string;
  placeholder?: string;
  onSave: (next: string) => Promise<string | null>;
  onClose: () => void;
  /** 창 안에 넣을 추가 버튼 (예: 완료 취소) */
  extraAction?: { label: string; run: () => Promise<string | null>; danger?: boolean };
  /** 적은 값이 말이 되는지 — 막을 것과 물어볼 것을 돌려준다 */
  check?: (value: string) => DateVerdict;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    firstRef.current?.focus();
    if (kind === "text") firstRef.current?.select?.();
  }, [kind]);

  const dirty = draft !== value;

  /** 오타로 보이는 값인지 (막을 것 / 묻기만 할 것) */
  const verdict = check ? check(draft) : null;
  const blocked = !!verdict?.block;

  async function commit() {
    if (blocked) return;
    setSaving(true);
    setError(null);
    const err = await onSave(draft);
    setSaving(false);
    if (err) {
      // 실패하면 창을 닫지 않는다. 쓴 내용을 날리지 않기 위함이다.
      setError(err);
      return;
    }
    onClose();
  }

  function tryClose() {
    if (dirty && !window.confirm("고친 내용을 저장하지 않고 닫습니다. 계속하시겠습니까?")) return;
    onClose();
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) tryClose();
      }}
    >
      <div
        className={cn(
          "bg-white w-full rounded-t-2xl md:rounded-2xl p-4 md:p-5",
          // 내용처럼 긴 글은 폰에서 화면을 거의 꽉 채워야 쓸 만하다
          kind === "textarea" ? "md:max-w-2xl h-[88dvh] md:h-auto flex flex-col" : "md:max-w-md"
        )}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-bold text-gray-900">{label}</h3>
          <button
            onClick={tryClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
            title="닫기"
          >
            ×
          </button>
        </div>
        {hint && <p className="text-xs text-gray-500 mb-3 break-keep">{hint}</p>}

        {kind === "textarea" && (
          <textarea
            ref={firstRef as React.Ref<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className="w-full flex-1 min-h-[180px] md:min-h-[240px] rounded-lg border border-gray-300 px-3 py-2.5 text-base leading-relaxed resize-none"
          />
        )}

        {kind === "text" && (
          <input
            ref={firstRef as React.Ref<HTMLInputElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />
        )}

        {kind === "date" && (
          <div className="space-y-2">
            <input
              ref={firstRef as React.Ref<HTMLInputElement>}
              type="date"
              value={draft}
              min={min ?? DATE_MIN}
              max={max ?? DATE_MAX}
              onChange={(e) => setDraft(fixYear(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />

            {/*
              브라우저가 날짜를 10/20/2026 처럼 미국식으로 보여준다.
              월과 일이 뒤바뀐 것처럼 읽혀 헷갈리므로, 고른 날짜를 한글로 크게 다시 적는다.
            */}
            <p className="text-base font-bold text-gray-900">
              {draft ? koreanDate(draft) : <span className="text-gray-400 font-normal">날짜 없음</span>}
            </p>

            {verdict && (
              <p
                className={cn(
                  "text-sm break-keep rounded-lg px-3 py-2",
                  verdict.block
                    ? "bg-red-50 border border-red-200 text-red-700"
                    : "bg-amber-50 border border-amber-200 text-amber-800"
                )}
              >
                {verdict.block ?? verdict.warn}
              </p>
            )}

            {/* 자주 쓰는 날짜는 눌러서 한 번에 */}
            <div className="flex gap-1.5 flex-wrap">
              {quickDates().map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setDraft(q.value)}
                  className={cn(
                    "text-xs px-2.5 py-1.5 rounded-lg border",
                    draft === q.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {q.label}
                </button>
              ))}
              {draft && (
                <button
                  type="button"
                  onClick={() => setDraft("")}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50"
                >
                  비우기
                </button>
              )}
            </div>
          </div>
        )}

        {kind === "progress" && (
          <div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Number(draft) || 0}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1"
              />
              <span className="text-lg font-bold text-gray-900 w-16 text-right">
                {Number(draft) || 0}%
              </span>
            </div>
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {[0, 25, 50, 75, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDraft(String(v))}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-lg border",
                    Number(draft) === v
                      ? "bg-gray-900 text-white border-gray-900"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 pt-4 shrink-0">
          <button
            onClick={tryClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={commit}
            disabled={saving || !dirty || blocked}
            title={verdict?.block ?? undefined}
            className="flex-1 rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>

        {extraAction && (
          <button
            onClick={async () => {
              setSaving(true);
              setError(null);
              const err = await extraAction.run();
              setSaving(false);
              if (err) {
                setError(err);
                return;
              }
              onClose();
            }}
            disabled={saving}
            className={cn(
              "w-full mt-2 rounded-lg border py-2.5 text-sm font-medium disabled:opacity-50",
              extraAction.danger
                ? "border-red-200 text-red-600 hover:bg-red-50"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            )}
          >
            {extraAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
