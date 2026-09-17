"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { Notice } from "@/lib/types";

export default function NoticePopup({ userId }: { userId: string }) {
  const [queue, setQueue] = useState<Notice[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadUnread = useCallback(async () => {
    const supabase = createClient();

    const [{ data: notices }, { data: reads }] = await Promise.all([
      supabase.from("notices").select("*").order("created_at", { ascending: true }),
      supabase.from("notice_reads").select("notice_id").eq("user_id", userId),
    ]);

    const readIds = new Set((reads ?? []).map((r) => r.notice_id));
    const unread = ((notices ?? []) as Notice[]).filter(
      // 자기가 등록한 공지는 자기에게 팝업으로 띄우지 않는다
      (n) => !readIds.has(n.id) && n.created_by !== userId
    );
    setQueue(unread);
  }, [userId]);

  useEffect(() => {
    loadUnread();
    // 새 공지가 올라오면 재접속 없이도 뜨도록 주기적으로 확인
    const timer = setInterval(loadUnread, 60000);
    return () => clearInterval(timer);
  }, [loadUnread]);

  async function handleConfirm() {
    if (queue.length === 0) return;
    setConfirming(true);
    setError(null);

    const supabase = createClient();
    const current = queue[0];

    // 같은 공지를 두 번 확인해도 오류가 나지 않도록 중복은 무시
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

  return (
    <div className="no-print fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <p className="text-xs font-medium text-blue-600 mb-1">
          공지사항{queue.length > 1 ? ` (${queue.length}건 중 1건)` : ""}
        </p>
        <h2 className="text-lg font-bold text-gray-900 mb-2">{current.title}</h2>
        <p className="text-xs text-gray-400 mb-4">{formatDateTime(current.created_at)}</p>
        <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto mb-6">
          {current.content}
        </div>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full rounded-lg bg-blue-600 text-white py-3 font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {confirming ? "처리 중..." : "확인했습니다"}
        </button>
      </div>
    </div>
  );
}
