"use client";

import { useState } from "react";

/**
 * 삭제 잠금 창.
 *
 * 비밀번호는 실수로 지우는 것을 막는 잠금이다. 화면에서 확인하는 것이라
 * 작정하고 뚫으려면 뚫린다 — 진짜 방어는 서버 권한(팀장만 삭제 가능)이다.
 * 여기서는 "손이 미끄러져 사라지는 일"을 막는 것이 목적이다.
 *
 * 지워도 무엇을 언제 누가 지웠는지는 deleted_tasks 에 남는다.
 */
const CODE = "0000";

export default function DeleteLock({
  title,
  onConfirm,
  onClose,
}: {
  /** 지울 대상 이름 — 무엇을 지우는지 눈으로 확인하게 한다 */
  title: string;
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (code !== CODE) {
      setError("비밀번호가 맞지 않습니다.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const err = await onConfirm();
      if (err) {
        setError(err);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print fixed inset-0 z-[60] bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-5">
        <h3 className="text-base font-bold text-gray-900">업무 삭제</h3>
        <p className="text-sm text-gray-600 mt-2 break-keep">
          <span className="font-medium text-gray-900">{title}</span>
        </p>
        <p className="text-xs text-red-600 mt-2 break-keep">
          삭제하면 이 업무의 진행기록과 변경이력도 함께 사라집니다. 되돌릴 수 없습니다.
          (언제 누가 무엇을 지웠는지는 따로 남습니다)
        </p>

        <label className="block text-xs text-gray-500 mt-4">
          삭제 비밀번호
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="● ● ● ●"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base tracking-widest text-center mt-1"
          />
        </label>

        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="flex gap-2 pt-4">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={run}
            disabled={busy || code.length === 0}
            className="flex-1 rounded-lg bg-red-600 text-white py-2.5 font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "삭제 중..." : "삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}
