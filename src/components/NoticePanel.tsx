"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isManager } from "@/lib/roles";
import type { Profile } from "@/lib/types";

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
  const path = usePathname();
  const router = useRouter();

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
    setSent(true);
    setTimeout(() => {
      setSent(false);
      setOpen(false);
    }, 900);
  }

  return (
    <>
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
