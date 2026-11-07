"use client";

import type { QuickKey } from "@/lib/today";
import { cn } from "@/lib/utils";

/**
 * 화면 맨 위 「오늘 한 줄」 — 숫자 칩 몇 개.
 * 누르면 그것만 추려지고, 다시 누르면 풀린다. 0건인 칩은 안 보인다.
 */
export type Chip = {
  key: QuickKey;
  label: string;
  count: number;
  tone: "red" | "amber" | "blue" | "gray" | "emerald" | "violet";
  /** 숫자 뒤에 붙는 짧은 말 (예: "최대 3일째") */
  hint?: string;
};

const TONE: Record<Chip["tone"], { off: string; on: string; dot: string }> = {
  red: {
    off: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100",
    on: "bg-red-600 border-red-600 text-white",
    dot: "bg-red-500",
  },
  amber: {
    off: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100",
    on: "bg-amber-500 border-amber-500 text-white",
    dot: "bg-amber-500",
  },
  blue: {
    off: "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100",
    on: "bg-blue-600 border-blue-600 text-white",
    dot: "bg-blue-500",
  },
  violet: {
    off: "border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100",
    on: "bg-violet-600 border-violet-600 text-white",
    dot: "bg-violet-500",
  },
  emerald: {
    off: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    on: "bg-emerald-600 border-emerald-600 text-white",
    dot: "bg-emerald-500",
  },
  gray: {
    off: "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    on: "bg-gray-800 border-gray-800 text-white",
    dot: "bg-gray-400",
  },
};

export default function TodayStrip({
  title = "오늘",
  chips,
  active,
  onPick,
  emptyText = "오늘 급한 것이 없습니다",
  right,
}: {
  title?: string;
  chips: Chip[];
  active: QuickKey | null;
  onPick: (k: QuickKey | null) => void;
  emptyText?: string;
  /** 오른쪽 끝에 둘 것 (링크 등) */
  right?: React.ReactNode;
}) {
  const shown = chips.filter((c) => c.count > 0);

  return (
    <div className="no-print rounded-xl border border-gray-200 bg-white px-3 py-2.5 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-gray-500 mr-1 whitespace-nowrap">{title}</span>
      {shown.length === 0 ? (
        <span className="text-sm text-emerald-700">✓ {emptyText}</span>
      ) : (
        shown.map((c) => {
          const on = active === c.key;
          return (
            <button
              key={c.key}
              onClick={() => onPick(on ? null : c.key)}
              title={on ? "전체로 돌아가기" : `${c.label}만 보기`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                on ? TONE[c.tone].on : TONE[c.tone].off
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", on ? "bg-white" : TONE[c.tone].dot)} />
              {c.label} <b className="text-base leading-none">{c.count}</b>
              {c.hint && <span className="text-xs opacity-80">· {c.hint}</span>}
            </button>
          );
        })
      )}
      {active && (
        <button
          onClick={() => onPick(null)}
          className="text-xs text-gray-500 underline underline-offset-2 ml-1"
        >
          전체 보기
        </button>
      )}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}
