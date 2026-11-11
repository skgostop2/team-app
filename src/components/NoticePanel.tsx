"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isManager } from "@/lib/roles";
import type { Notice, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const HIDE_KEY = "notice-strip-hidden";
const SHOW_COUNT = 3;

/**
 * 화면 오른쪽에 떠 있는 「제안」 버튼.
 * 누르면 화면 한가운데에 작은 창이 뜨고, 한 줄 쓰고 엔터면 끝난다.
 * 아무것도 묻지 않는다 — 붙이면 다른 사람 화면에 바로 팝업으로 뜬다.
 */
export default function NoticePanel() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const [recent, setRecent] = useState<Notice[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  /** 쪽지를 펼쳐 보이는지 — 평소에는 접어 두어 표를 가리지 않는다. 올린 직후에는 잠깐 펼친다 */
  const [expanded, setExpanded] = useState(false);
  const path = usePathname();
  const router = useRouter();

  // 방금 올린 글도 바로 보이도록 목록을 불러온다 (15초마다, 올린 직후에도)
  async function loadRecent() {
    const supabase = createClient();
    const [{ data: n }, { data: p }] = await Promise.all([
      supabase
        .from("notices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("profiles").select("id,name"),
    ]);
    setRecent((n ?? []) as Notice[]);
    setNames(new Map((p ?? []).map((x) => [x.id as string, x.name as string])));
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDE_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      // 저장이 막혀 있어도 그냥 전부 보여준다
    }
    loadRecent();
    const supabase = createClient();
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try {
      ch = supabase
      .channel(`notices-panel-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, () => loadRecent())
      .subscribe();
    } catch (e) {
      console.warn("실시간 구독 실패 — 주기적으로 다시 봅니다", e);
      ch = null;
    }
    const timer = setInterval(loadRecent, 60000);
    return () => {
      if (ch) supabase.removeChannel(ch).catch(() => {});
      clearInterval(timer);
    };
  }, []);

  function hide(id: string) {
    const next = new Set(hidden).add(id);
    setHidden(next);
    try {
      localStorage.setItem(HIDE_KEY, JSON.stringify([...next]));
    } catch {
      // 이번 화면에서만 숨겨진다
    }
  }

  useEffect(() => {
    if (open) area.current?.focus();
  }, [open]);

  // 「공지 · 제안」 화면에서는 같은 입력칸이 이미 있으므로 띄우지 않는다
  if (path?.startsWith("/notices")) return null;

  async function post() {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);

    const [first, ...others] = body.split(/\r?\n/);
    const title = first.trim().slice(0, 60);
    const content = (first.trim().length > 60 ? body : others.join("\n").trim()) || title;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: me } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.id ?? "")
      .single();

    const { error: err } = await supabase.from("notices").insert({
      title,
      content,
      created_by: user?.id,
      kind: isManager(me as Profile | null) ? "공지" : "공유",
      popup: true,
    });
    setSaving(false);

    if (err) {
      // 실패해도 쓴 글은 그대로 둔다
      setError(err.message);
      return;
    }
    setText("");
    loadRecent(); // 올린 글이 오른쪽에 바로 붙는다
    setExpanded(true);
    setTimeout(() => setExpanded(false), 8000);
    window.dispatchEvent(new Event("notice-posted")); // 폰 위쪽 띠도 바로
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setOpen(false);
    }, 900);
  }

  return (
    <>
      {/* 최근에 붙은 글 — 올리면 여기 바로 보인다 (PC 화면 오른쪽) */}
      {!open && !expanded && !path?.startsWith("/overtime") && recent.filter((n) => !hidden.has(n.id)).length > 0 && (
        <button
          onClick={() => setExpanded(true)}
          title="최근 공지·제안 펼쳐 보기"
          className="no-print hidden md:inline-flex fixed right-3 bottom-48 z-30 items-center gap-1.5 rounded-full border border-amber-400 bg-amber-50 text-amber-900 px-3 py-1.5 text-xs font-medium shadow hover:bg-amber-100"
        >
          📢 최근 글 {Math.min(SHOW_COUNT, recent.filter((n) => !hidden.has(n.id)).length)}
        </button>
      )}
      {!open && expanded && (
        <div className="no-print hidden md:flex fixed right-3 bottom-48 z-30 w-64 flex-col gap-2">
          <button
            onClick={() => setExpanded(false)}
            className="self-end text-[11px] text-gray-500 hover:text-gray-800 px-1"
          >
            접기 ▾
          </button>
          {recent
            .filter((n) => !hidden.has(n.id))
            .slice(0, SHOW_COUNT)
            .reverse()
            .map((n) => {
              const isNotice = (n.kind ?? "공지") === "공지";
              return (
                <div
                  key={n.id}
                  onClick={() => router.push("/notices")}
                  className={
                    "relative cursor-pointer rounded-xl border-2 p-3 pr-7 shadow-lg " +
                    (isNotice
                      ? "bg-sky-50 border-sky-400"
                      : "bg-amber-50 border-amber-400")
                  }
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      hide(n.id);
                    }}
                    title="이 쪽지 치우기"
                    className="absolute top-1 right-2 text-gray-400 hover:text-gray-700 text-lg leading-none"
                  >
                    ×
                  </button>
                  <p className="text-[10px] text-gray-500">
                    <b className={isNotice ? "text-blue-700" : "text-emerald-700"}>
                      {isNotice ? "공지" : "제안"}
                    </b>{" "}
                    · {names.get(n.created_by ?? "") ?? "-"} · {formatDateTime(n.created_at)}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5 break-keep line-clamp-3">
                    {n.title}
                  </p>
                </div>
              );
            })}
        </div>
      )}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="제안·공유 올리기 (팀 전체에 팝업으로 뜹니다)"
          className="no-print fixed right-0 bottom-44 md:bottom-28 z-30 rounded-l-xl bg-amber-400 text-gray-900 px-3 py-3 shadow-lg hover:bg-amber-300 border-y border-l border-amber-500"
        >
          <span className="block text-lg leading-none">💬</span>
          <span className="block text-[10px] mt-1 leading-none font-bold">제안</span>
        </button>
      )}

      {open && (
        <div
          className="no-print fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !text.trim()) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-amber-50 border-4 border-amber-400 shadow-2xl overflow-hidden">
            <div className="bg-amber-400 px-5 py-3 flex items-center justify-between">
              <span className="text-lg font-extrabold text-gray-900">💬 제안·공유</span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-700 hover:text-black text-2xl leading-none px-1"
                title="닫기"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-3">
              {sent ? (
                <p className="py-8 text-center text-lg font-bold text-emerald-700">
                  올렸습니다 ✓
                </p>
              ) : (
                <>
                  <textarea
                    ref={area}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      // 한글 조합 중 엔터는 글자 확정이므로 올리지 않는다
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        post();
                      }
                    }}
                    rows={4}
                    placeholder="하고 싶은 말을 쓰고 엔터 (줄바꿈은 Shift+엔터)"
                    className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-base leading-relaxed"
                  />
                  {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setOpen(false);
                        router.push("/notices");
                      }}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      지난 글 보기
                    </button>
                    <button
                      onClick={post}
                      disabled={saving || text.trim() === ""}
                      className="ml-auto rounded-lg bg-gray-900 text-white px-5 py-2 font-bold hover:bg-black disabled:opacity-40"
                    >
                      {saving ? "올리는 중..." : "올리기"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
