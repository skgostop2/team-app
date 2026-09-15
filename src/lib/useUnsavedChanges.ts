"use client";

import { useEffect, useRef } from "react";

const MESSAGE = "저장하지 않은 내용이 있습니다. 이 화면을 나가면 작성 중이던 내용이 사라집니다.";

/**
 * 작성 중인 내용이 있을 때 화면을 벗어나려 하면 경고한다.
 *
 * - 브라우저 새로고침 / 탭 닫기 / 뒤로가기 → 브라우저 기본 확인창
 * - 앱 안의 링크 클릭 (사이드바, 목록으로 등) → 확인창을 띄우고 취소하면 이동하지 않음
 */
export function useUnsavedChanges(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = MESSAGE;
      return MESSAGE;
    }

    function handleClick(e: MouseEvent) {
      if (!dirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href") ?? "";
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;

      // 같은 페이지로의 이동이면 굳이 묻지 않는다
      if (href === window.location.pathname) return;

      if (!window.confirm(MESSAGE)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    // capture 단계에서 잡아야 Next.js Link 의 이동보다 먼저 막을 수 있다
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);
}

/** 확인창을 직접 띄워야 할 때 (버튼 등 링크가 아닌 경우) */
export function confirmDiscard(dirty: boolean): boolean {
  if (!dirty) return true;
  return window.confirm(MESSAGE);
}
