"use client";

import { useEffect, useState } from "react";
import { enablePush, pushState, type PushState } from "@/lib/push";

const DISMISS_KEY = "push-banner-dismissed-at";

/**
 * "알림을 켜 두시겠습니까" 띠 — 아직 안 켠 기기에서만, 하루에 한 번만 보인다.
 * 켜면 새 지시·마감·답변·제안이 폰·PC 에 바로 뜬다.
 */
export default function PushBanner() {
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await pushState();
      setState(s);
      if (s !== "off") return;
      try {
        const last = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
        if (Date.now() - last < 24 * 60 * 60 * 1000) return;
      } catch {
        // 저장이 막혀 있으면 그냥 보여준다
      }
      setHidden(false);
    })();
  }, []);

  if (hidden || state !== "off") return null;

  async function turnOn() {
    setBusy(true);
    const s = await enablePush();
    setBusy(false);
    setState(s);
    if (s === "on") setHidden(true);
  }

  function later() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // 못 저장해도 이번엔 닫는다
    }
    setHidden(true);
  }

  return (
    <div className="no-print rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 flex items-center gap-3 flex-wrap">
      <span className="text-xl">🔔</span>
      <p className="text-sm text-blue-900 break-keep flex-1 min-w-[200px]">
        <b>알림을 켜 두시면</b> 새 지시·마감·질문 답변·제안이 이 기기에 바로 뜹니다. 들어와서 확인하지
        않아도 됩니다.
      </p>
      <button
        onClick={turnOn}
        disabled={busy}
        className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "켜는 중..." : "알림 켜기"}
      </button>
      <button onClick={later} className="text-xs text-blue-700 underline underline-offset-2">
        나중에
      </button>
    </div>
  );
}
