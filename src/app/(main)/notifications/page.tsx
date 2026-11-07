"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, cn } from "@/lib/utils";
import { disablePush, enablePush, pushState, type PushState } from "@/lib/push";
import type { Notification } from "@/components/NotificationBell";

const KIND_ICON: Record<string, string> = {
  지시: "📌", 담당변경: "🔁", 질문: "❓", 답변: "💬", 제안: "💡", 공지: "📢", 보고: "📥", 마감: "⏰",
};

/** 알림 전체 목록 + 이 기기의 푸시 켜기/끄기 */
export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id,kind,title,body,url,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data ?? []) as Notification[]);
    setState(await pushState());
  }
  useEffect(() => {
    load();
  }, []);

  async function go(n: Notification) {
    if (!n.read_at) {
      const supabase = createClient();
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    router.push(n.url || "/tasks");
  }

  async function toggle() {
    setBusy(true);
    if (state === "on") {
      await disablePush();
      setState("off");
    } else {
      setState(await enablePush());
    }
    setBusy(false);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">알림</h1>
        <p className="text-sm text-gray-500 mt-0.5 break-keep">
          새 지시 · 담당 변경 · 질문과 답변 · 공지와 제안 · 마감(전날·당일·지연 시작)이 여기 쌓입니다.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-xl">🔔</span>
        <div className="flex-1 min-w-[200px] text-sm break-keep">
          {state === "on" && <span className="text-emerald-700 font-medium">이 기기에 푸시 알림이 켜져 있습니다.</span>}
          {state === "off" && <span className="text-gray-700">이 기기에는 아직 푸시가 꺼져 있습니다. 켜면 들어오지 않아도 바로 뜹니다.</span>}
          {state === "denied" && (
            <span className="text-amber-800">
              브라우저에서 알림을 차단해 두셨습니다. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꾼 뒤 다시 켜 주세요.
            </span>
          )}
          {state === "unsupported" && <span className="text-gray-500">이 브라우저는 푸시 알림을 지원하지 않습니다. (아이폰은 홈 화면에 추가한 뒤 가능)</span>}
        </div>
        {(state === "on" || state === "off") && (
          <button
            onClick={toggle}
            disabled={busy}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50",
              state === "on" ? "border border-gray-300 text-gray-700 hover:bg-gray-50" : "bg-blue-600 text-white hover:bg-blue-700"
            )}
          >
            {busy ? "..." : state === "on" ? "이 기기에서 끄기" : "알림 켜기"}
          </button>
        )}
      </div>

      <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {items.length === 0 && <li className="px-4 py-10 text-center text-sm text-gray-400">아직 알림이 없습니다</li>}
        {items.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => go(n)}
              className={cn("w-full text-left px-4 py-3 hover:bg-gray-50", !n.read_at && "bg-blue-50/60")}
            >
              <p className="text-sm text-gray-900 break-keep">
                <span className="mr-1">{KIND_ICON[n.kind] ?? "•"}</span>
                <b className={n.read_at ? "font-medium" : ""}>{n.title}</b>
              </p>
              {n.body && <p className="text-xs text-gray-600 break-keep mt-0.5">{n.body}</p>}
              <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(n.created_at)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
