"use client";

import { useEffect } from "react";

/** 로그인·가입 등 메뉴 밖 화면이 깨졌을 때의 안전망 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[화면 오류]", error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-6 text-center space-y-3">
        <p className="text-3xl">⚠️</p>
        <h1 className="text-lg font-bold text-gray-900">화면을 그리다 문제가 생겼습니다</h1>
        <p className="text-sm text-gray-600 break-keep">
          자료는 안전합니다. 다시 불러와 보시고, 계속 그러면 아래 글을 팀장에게 알려 주세요.
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-gray-900 text-white px-4 py-2.5 text-sm font-medium hover:bg-black"
          >
            다시 불러오기
          </button>
          <a
            href="/login"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            처음으로
          </a>
        </div>
        <p className="text-[11px] text-gray-400 break-all">
          {error.message}
          {error.digest ? ` (${error.digest})` : ""}
        </p>
      </div>
    </div>
  );
}
