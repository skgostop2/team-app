"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { Notice } from "@/lib/types";

/**
 * 공지·제안 팝업 — 눈에 확 띄어야 한다.
 *
 * - 화면 전체를 어둡게 덮고, 윗줄에 굵은 색 띠로 "공지" / "제안" 을 알린다.
 * - 읽음 확인을 누르기 전에는 닫히지 않는다 (바깥을 눌러도 안 닫힘).
 * - 올린 사람이 "팝업 끄기" 로 올린 글(popup=false)은 목록에만 쌓이고 띄우지 않는다.
 * - 자기가 올린 글은 자기에게 띄우지 않는다.
 */
export default function NoticePopup({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<Notice[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUnread = useCallback(async () => {
    const supabase = createClient();

    const [{ data: notices }, { data: reads }, { data: profs }] = await Promise.all([
      supabase.from("notices").select("*").order("created_at", { ascending: true }),
      supabase.from("notice_reads").select("notice_id").eq("user_id", userId),
      supabase.from("profiles").select("id,name"),
    ]);

    setNames(new Map((profs ?? []).map((p) => [p.id as string, p.name as string])));

    const readIds = new Set((reads ?? []).map((r) => r.notice_id));
    const unread = ((notices ?? []) as Notice[]).filter(
      (n) =>
        !readIds.has(n.id) &&
        n.created_by !== userId &&
        // popup 이 꺼진 글은 띄우지 않는다 (이전 공지는 popup 값이 없으면 띄운다)
        n.popup !== false
    );
    setQueue(unread);
  }, [userId]);

  useEffect(() => {
    loadUnread();
    // 새 글이 올라오는 순간 받는다. 혹시 끊겼을 때를 위해 5분마다 한 번 더 본다.
    const supabase = createClient();
    const ch = supabase
      .channel("notices-popup")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notices" }, () => loadUnread())
      .subscribe();
    const timer = setInterval(loadUnread, 300000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(timer);
    };
  }, [loadUnread]);

  async function handleConfirm() {
    if (queue.length === 0) return;
    setConfirming(true);
    setError(null);

    const supabase = createClient();
    const current = queue[0];

    const { error: insertError } = await supabase
      .from("notice_reads")
      .upsert({ notice_id: current.id, user_id: userId }, { onConflict: "notice_id,user_id" });

    if (insertError) {
      setError("확인 처리에 실패했습니다. 잠시 후 다시 눌러주세요.");
      setConfirming(false);
      return;
    }

    setQueue((q) => q.slice(1));
    setConfirming(false);
  }

  if (queue.length === 0) return null;

  const current = queue[0];
  const isNotice = (current.kind ?? "공지") === "공지";
  const author = names.get(current.created_by ?? "") ?? "";

  return (
    <div className="no-print fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        className={
          "bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-4 " +
          (isNotice ? "border-blue-600" : "border-emerald-500")
        }
      >
        {/* 굵은 색 띠 — 먼저 눈에 들어오는 부분 */}
        <div
          className={
            "px-5 py-3 text-white flex items-center justify-between " +
            (isNotice ? "bg-blue-600" : "bg-emerald-500")
          }
        >
          <span className="text-lg font-extrabold tracking-wide">
            {isNotice ? "📢 공지사항" : "💬 팀원 제안·공유"}
          </span>
          {queue.length > 1 && (
            <span className="text-xs font-bold bg-white/25 rounded-full px-2.5 py-1">
              {queue.length}건 남음
            </span>
          )}
        </div>

        <div className={"p-6 " + (isNotice ? "bg-sky-50" : "bg-amber-50")}>
          <h2 className="text-xl font-extrabold text-gray-900 mb-1 break-keep">{current.title}</h2>
          <p className="text-xs text-gray-500 mb-4">
            {author && <b className="text-gray-700">{author}</b>}
            {author && " · "}
            {formatDateTime(current.created_at)}
          </p>
          {current.content.trim() !== current.title.trim() && (
            <div className="text-base text-gray-800 whitespace-pre-wrap break-keep max-h-64 overflow-y-auto mb-6 leading-relaxed">
              {current.content}
            </div>
          )}
          {current.content.trim() === current.title.trim() && <div className="mb-4" />}
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className={
              "w-full rounded-xl text-white py-3.5 text-base font-bold disabled:opacity-50 transition " +
              (isNotice ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700")
            }
          >
            {confirming ? "처리 중..." : "확인했습니다"}
          </button>
        </div>
      </div>
    </div>
  );
}
