"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import NoticeBoard from "@/components/NoticeBoard";
import { cn } from "@/lib/utils";

/**
 * 어느 화면에서나 오른쪽에 붙는 「제안」 패널.
 * 내 메모장 버튼 바로 위에 떠 있고, 누르면 같은 쪽에서 열린다.
 * 한 줄 써서 엔터면 팀 전체에 붙는다.
 */
export default function NoticePanel() {
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // 공지·제안 화면 자체에서는 같은 것이 이미 보이므로 띄우지 않는다
  if (path?.startsWith("/notices")) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="공지 · 제안 (팀 전체가 봅니다)"
          className="fixed right-0 bottom-44 md:bottom-28 z-30 rounded-l-xl bg-amber-400 text-gray-900 px-3 py-3 shadow-lg hover:bg-amber-300 border-y border-l border-amber-500"
        >
          <span className="block text-lg leading-none">💬</span>
          <span className="block text-[10px] mt-1 leading-none font-bold">제안</span>
        </button>
      )}

      {open && (
        <>
          <div onClick={() => setOpen(false)} className="md:hidden fixed inset-0 z-40 bg-black/30" />
          <aside
            className={cn(
              "fixed z-50 bg-white border-gray-200 shadow-2xl flex flex-col",
              "inset-x-0 bottom-0 h-[80dvh] rounded-t-2xl border-t",
              "md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:h-dvh md:rounded-none md:border-l md:border-t-0"
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 shrink-0">
              <div>
                <p className="text-sm font-bold text-gray-900">공지 · 제안</p>
                <p className="text-[11px] text-gray-400">쓰면 팀 전체가 봅니다</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                title="닫기"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <NoticeBoard compact />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
