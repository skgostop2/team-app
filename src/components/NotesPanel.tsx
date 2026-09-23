"use client";

import { useEffect, useState } from "react";
import NotesBoard from "@/components/NotesBoard";
import { cn } from "@/lib/utils";

const OPEN_KEY = "notes-panel-open";

/**
 * 어느 화면에서나 오른쪽에 붙는 개인 메모 패널.
 *
 * - PC: 오른쪽에서 슬라이드로 붙는다. 열어두면 메뉴를 옮겨도 계속 열려 있다.
 * - 모바일: 아래에서 올라오는 창으로 뜬다.
 * - "새 창으로" 를 누르면 진짜 별도 브라우저 창으로 띄운다 (듀얼 모니터용).
 */
export default function NotesPanel() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  // 열어둔 상태를 기억한다 (이 브라우저에만 저장되는 편의 기능)
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      // 사생활 보호 모드 등에서 막히면 그냥 닫힌 상태로 시작한다
    }
    setReady(true);
  }, []);

  const [blocked, setBlocked] = useState(false);

  function toggle(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? "1" : "0");
    } catch {
      // 저장이 안 돼도 이번 세션 동안은 정상 동작한다
    }
  }

  /**
   * 메모장을 별도 창으로 띄운다.
   *
   * 앱 메뉴가 없는 /notes-window 를 연다. PC 는 작은 창으로,
   * 폰은 브라우저가 창 크기를 무시하므로 새 탭으로 열린다.
   * 차단당하면 조용히 지나가지 않고 알려준다.
   */
  function popOut() {
    const w = window.open(
      "/notes-window",
      "team-app-notes",
      "width=520,height=720,menubar=no,toolbar=no,location=no,status=no"
    );
    if (!w) {
      setBlocked(true);
      return;
    }
    w.focus();
    setBlocked(false);
    toggle(false);
  }

  if (!ready) return null;

  return (
    <>
      {/* 여는 버튼 — 화면 오른쪽에 항상 떠 있다 */}
      {!open && (
        <button
          onClick={() => toggle(true)}
          title="내 메모장 (나만 봅니다)"
          className="fixed right-0 bottom-24 md:bottom-10 z-30 rounded-l-xl bg-gray-900 text-white px-3 py-3 shadow-lg hover:bg-black"
        >
          <span className="block text-lg leading-none">📝</span>
          <span className="block text-[10px] mt-1 leading-none">메모</span>
        </button>
      )}

      {open && (
        <>
          {/* 모바일에서만 배경을 덮는다. PC 에서는 업무 화면을 계속 보며 쓴다 */}
          <div
            onClick={() => toggle(false)}
            className="md:hidden fixed inset-0 z-30 bg-black/30"
          />

          <aside
            className={cn(
              "fixed z-40 bg-white border-gray-200 shadow-2xl flex flex-col",
              // 모바일: 아래에서 올라오는 창
              "inset-x-0 bottom-0 h-[72dvh] rounded-t-2xl border-t",
              // PC: 오른쪽에 붙는 패널
              "md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:h-dvh md:rounded-none md:border-l md:border-t-0"
            )}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">내 메모장</p>
                <p className="text-[11px] text-gray-400">나만 볼 수 있습니다</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={popOut}
                  title="별도 창으로 띄우기 (업무 화면 옆에 놓고 쓰기)"
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  새 창으로
                </button>
                <button
                  onClick={() => toggle(false)}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                  title="닫기"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0">
              <NotesBoard compact />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
