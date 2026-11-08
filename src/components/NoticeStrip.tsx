"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notice } from "@/lib/types";

/** PC 오른쪽 쪽지와 같은 키 — 한쪽에서 치운 쪽지는 다른 쪽에서도 안 나온다 */
const HIDE_KEY = "notice-strip-hidden";

/**
 * 폰 화면 위쪽 띠 — 가장 최근 공지·제안 한 건.
 * 화면을 덮지 않고 상단바 바로 아래 자리를 차지하며, 스크롤하면 같이 올라간다.
 */
export default function NoticeStrip() {
  const [latest, setLatest] = useState<Notice[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const path = usePathname();
  const router = useRouter();

  async function load() {
    const supabase = createClient();
    const [{ data: n }, { data: p }] = await Promise.all([
      supabase.from("notices").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("profiles").select("id,name"),
    ]);
    setLatest((n ?? []) as Notice[]);
    setNames(new Map((p ?? []).map((x) => [x.id as string, x.name as string])));
    // PC 쪽에서 치운 것도 반영
    try {
      const raw = localStorage.getItem(HIDE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      // 저장이 막혀 있으면 전부 보여준다
    }
  }

  useEffect(() => {
    // PC 화면에서는 이 띠가 안 보이므로 불러오지 않는다 (오른쪽 쪽지가 대신한다)
    if (window.matchMedia("(min-width: 768px)").matches) return;
    load();
    const supabase = createClient();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
      .channel(`notices-strip-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => load())
      .subscribe();
    } catch (e) {
      console.warn("실시간 구독 실패 — 주기적으로 다시 봅니다", e);
      ch = null;
    }
    const timer = setInterval(load, 60000);
    // 💬 창에서 글을 올리면 바로 다시 불러온다
    const onPosted = () => load();
    window.addEventListener("notice-posted", onPosted);
    return () => {
      if (ch) supabase.removeChannel(ch).catch(() => {});
      clearInterval(timer);
      window.removeEventListener("notice-posted", onPosted);
    };
  }, []);

  if (path?.startsWith("/notices")) return null;
  const n = latest.find((x) => !hidden.has(x.id));
  if (!n) return null;

  const isNotice = (n.kind ?? "공지") === "공지";

  function hide() {
    const next = new Set(hidden).add(n!.id);
    setHidden(next);
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify([...next]));
    } catch {
      // 이번 화면에서만 숨겨진다
    }
  }

  return (
    <div
      className={
        "no-print md:hidden flex items-center gap-2 px-3 py-2 border-b text-sm " +
        (isNotice ? "bg-sky-50 border-sky-300" : "bg-amber-50 border-amber-300")
      }
    >
      <button onClick={() => router.push("/notices")} className="flex-1 min-w-0 text-left truncate">
        <span
          className={
            "mr-1.5 text-[11px] px-1.5 py-0.5 rounded text-white font-bold " +
            (isNotice ? "bg-blue-600" : "bg-emerald-600")
          }
        >
          {isNotice ? "공지" : "제안"}
        </span>
        <b className="text-gray-700">{names.get(n.created_by ?? "") ?? ""}</b>{" "}
        <span className="text-gray-900">{n.title}</span>
      </button>
      <button
        onClick={hide}
        title="이 쪽지 치우기"
        className="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
