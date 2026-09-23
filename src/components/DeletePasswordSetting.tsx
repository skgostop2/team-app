"use client";

import { useState } from "react";
import { changePassword } from "@/lib/deleteLock";

/**
 * 업무 삭제 비밀번호를 바꾸는 칸. 팀장만 보인다.
 *
 * 비밀번호는 해시로만 저장되므로 지금 비번이 무엇인지는 화면에서도 알 수 없다.
 * 잊어버리면 새로 지정해야 한다 — 그 안내를 같이 적어둔다.
 */
export default function DeletePasswordSetting({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== again) {
      setError("새 비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    const err = await changePassword(current, next, userId);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setCurrent("");
    setNext("");
    setAgain("");
    setDone(true);
    setOpen(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-gray-900">업무 삭제 비밀번호</h2>
          <p className="text-xs text-gray-500 mt-0.5 break-keep">
            업무를 지울 때 넣는 비밀번호입니다. 처음 값은 0000 입니다. 실수로 지우는 것을 막는
            잠금이며, 삭제 권한 자체는 팀장 계정에만 있습니다.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen((v) => !v);
            setDone(false);
            setError(null);
          }}
          className="text-xs px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 shrink-0"
        >
          {open ? "닫기" : "비밀번호 변경"}
        </button>
      </div>

      {done && <p className="text-sm text-emerald-700 mt-3">비밀번호를 바꿨습니다.</p>}

      {open && (
        <form onSubmit={submit} className="mt-3 space-y-2 max-w-sm">
          <input
            type="password"
            inputMode="numeric"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="현재 비밀번호"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />
          <input
            type="password"
            inputMode="numeric"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="새 비밀번호 (4자리 이상)"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />
          <input
            type="password"
            inputMode="numeric"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            placeholder="새 비밀번호 다시"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />
          {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
          <button
            type="submit"
            disabled={busy || !current || !next}
            className="w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "바꾸는 중..." : "변경"}
          </button>
          <p className="text-xs text-gray-400 break-keep">
            비밀번호는 해시로만 보관되어 잊어버리면 확인할 방법이 없습니다.
          </p>
        </form>
      )}
    </div>
  );
}
