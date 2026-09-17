"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 칸 하나만 고치는 작은 창.
 *
 * 표에서 그 칸을 누르면 이 창이 표 위에 뜬다. 화면을 옮기지 않으므로
 * 보던 자리를 잃지 않고, 칸 폭에 상관없이 넉넉하게 입력할 수 있다.
 *
 * 저장이 실패하면 창을 닫지 않고 입력한 내용을 그대로 둔다.
 */
export type FieldKind = "text" | "textarea" | "date" | "progress";

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

  async function commit() {
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
              min={min}
              max={max}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
            {draft && (
              <button
                type="button"
                onClick={() => setDraft("")}
                className="text-xs text-gray-500 underline"
              >
                날짜 비우기
              </button>
            )}
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
            disabled={saving || !dirty}
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
