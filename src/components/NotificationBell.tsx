"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  created_at: string;
  read_at: string | null;
};

const KIND_ICON: Record<string, string> = {
  지시: "📌",
  담당변경: "🔁",
  질문: "❓",
  답변: "💬",
  제안: "💡",
  공지: "📢",
  보고: "📥",
  마감: "⏰", 잔업: "⏱", 답글: "💬",
};

/**
 * 종(🔔) — 안 읽은 알림 수를 달고, 누르면 최근 알림이 펼쳐진다.
 * 서버가 알림을 넣는 순간 실시간으로 받는다 (새로고침 없음).
 * 푸시를 안 켠 사람도 여기서는 본다.
 */
export default function NotificationBell({
  userId,
  compact = false,
}: {
  userId: string;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<Notification | null>(null);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("id,kind,title,body,url,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notification[]);
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    /*
      채널 이름은 매번 새로 만든다. 같은 이름을 다시 쓰면 supabase 가 이미 구독 중인
      채널을 돌려주고, 거기에 .on() 을 또 붙이면 "cannot add callbacks after subscribe()"
      로 화면 전체가 깨진다 (11-09 장애 원인). 실시간이 안 되더라도 화면은 살아야 하므로
      전부 try 로 감싸고, 60초 폴링을 같이 둔다.
    */
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
        .channel(`notif-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const n = payload.new as Notification;
            setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev].slice(0, 30)));
            setFlash(n);
            setTimeout(() => setFlash((f) => (f?.id === n.id ? null : f)), 6000);
          }
        );
      ch.subscribe();
    } catch (e) {
      console.warn("알림 실시간 구독 실패 — 폴링으로 대신합니다", e);
      ch = null;
    }
    const timer = setInterval(load, 60000);
    // 탭이 오래 잠들었다 깨면 한 번 다시 맞춘다
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (ch) supabase.removeChannel(ch).catch(() => {});
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, load]);

  // 바깥을 누르면 닫힌다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  async function markAll() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    const supabase = createClient();
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  }

  async function go(n: Notification) {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      const supabase = createClient();
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    }
    router.push(n.url || "/tasks");
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="알림"
        className={cn(
          "relative inline-flex items-center justify-center rounded-lg hover:bg-gray-100",
          compact ? "w-9 h-9" : "w-full px-3 py-2.5 justify-start gap-2 text-sm font-medium text-gray-600"
        )}
      >
        <span className="text-lg leading-none">🔔</span>
        {!compact && <span>알림</span>}
        {unread > 0 && (
          <span
            className={cn(
              "rounded-full bg-red-600 text-white text-[11px] font-bold leading-none px-1.5 py-0.5",
              compact ? "absolute -top-0.5 -right-0.5" : "ml-auto"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-80 max-w-[92vw] rounded-xl border border-gray-200 bg-white shadow-2xl",
            compact ? "right-0 top-11" : "left-0 bottom-12"
          )}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <span className="text-sm font-bold text-gray-900">알림</span>
            <span className="flex items-center gap-3">
              {unread > 0 && (
                <button onClick={markAll} className="text-xs text-blue-600 hover:underline">
                  모두 읽음
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/notifications");
                }}
                className="text-xs text-gray-500 hover:underline"
              >
                전체 · 설정
              </button>
            </span>
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-gray-400">아직 알림이 없습니다</li>
            )}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => go(n)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 hover:bg-gray-50",
                    !n.read_at && "bg-blue-50/60"
                  )}
                >
                  <p className="text-sm text-gray-900 break-keep">
                    <span className="mr-1">{KIND_ICON[n.kind] ?? "•"}</span>
                    <b className={!n.read_at ? "" : "font-medium"}>{n.title}</b>
                  </p>
                  {n.body && (
                    <p className="text-xs text-gray-600 break-keep line-clamp-2 mt-0.5">{n.body}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-0.5">{formatDateTime(n.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 방금 온 알림 — 화면 위에 잠깐 */}
      {flash && (
        <button
          onClick={() => go(flash)}
          className="no-print fixed top-3 right-3 z-[70] max-w-sm rounded-xl border border-blue-300 bg-white shadow-2xl px-4 py-3 text-left animate-[fadeIn_.2s_ease-out]"
        >
          <p className="text-sm font-bold text-gray-900 break-keep">
            {KIND_ICON[flash.kind] ?? "•"} {flash.title}
          </p>
          {flash.body && <p className="text-xs text-gray-600 break-keep line-clamp-2">{flash.body}</p>}
        </button>
      )}
    </div>
  );
}
