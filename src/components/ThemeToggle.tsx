"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 화면 밝기 바꾸기.
 *
 * 고른 값은 이 브라우저에만 저장된다 (사람마다, PC마다 따로).
 * 눈이 불편한 사람은 언제든 밝은 화면으로 돌아갈 수 있어야 한다.
 *
 * 깜빡임 방지: 화면이 그려지기 전에 layout.tsx 의 작은 스크립트가 먼저
 * html 에 값을 붙인다. 여기서는 바꾸기만 한다.
 */

export const THEME_KEY = "ui-theme";

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"sf" | "light">("sf");

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    setTheme(saved === "light" ? "light" : "sf");
  }, []);

  function pick(next: "sf" | "light") {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장을 못 해도 이번 화면은 바뀐다
    }
  }

  return (
    <div
      className={cn(
        "no-print inline-flex rounded-lg border border-gray-300 overflow-hidden",
        compact ? "text-[11px]" : "text-xs"
      )}
    >
      <button
        type="button"
        onClick={() => pick("sf")}
        className={cn(
          "px-2.5 py-1.5 font-medium",
          theme === "sf" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
        )}
      >
        어둡게
      </button>
      <button
        type="button"
        onClick={() => pick("light")}
        className={cn(
          "px-2.5 py-1.5 font-medium border-l border-gray-300",
          theme === "light" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"
        )}
      >
        밝게
      </button>
    </div>
  );
}
