"use client";

import { useSearchParams } from "next/navigation";
import NotesBoard from "@/components/NotesBoard";

/**
 * 메모 전체 화면.
 * ?popup=1 로 열면 별도 창 모드 — 사이드 여백 없이 메모만 꽉 채운다.
 */
export default function NotesPage() {
  const params = useSearchParams();
  const popup = params.get("popup") === "1";

  if (popup) {
    return (
      <div className="fixed inset-0 z-[60] bg-white flex flex-col">
        <div className="px-3 py-2.5 border-b border-gray-200 shrink-0">
          <p className="text-sm font-bold text-gray-900">내 메모장</p>
          <p className="text-[11px] text-gray-400">나만 볼 수 있습니다</p>
        </div>
        <div className="flex-1 min-h-0">
          <NotesBoard compact />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900">내 메모장</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          나만 볼 수 있는 메모입니다. 팀장도 볼 수 없습니다. 자동으로 저장됩니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 h-[70dvh] min-h-[420px] overflow-hidden">
        <NotesBoard />
      </div>
    </div>
  );
}
