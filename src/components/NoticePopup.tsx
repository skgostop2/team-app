"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/utils";
import type { Notice } from "@/lib/types";

export default function NoticePopup() {
  const [queue, setQueue] = useState<Notice[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function loadUnread() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [{ data: notices }, { data: reads }] = await Promise.all([
      supabase.from("notices").select("*").order("created_at", { ascending: true }),
      supabase.from("notice_reads").select("notice_id").eq("user_id", user.id),
    ]);

    const readIds = new Set((reads ?? []).map((r) => r.notice_id));
    const unread = ((notices ?? []) as Notice[]).filter((n) => !readIds.has(n.id));
    setQueue(unread);
  }

  useEffect(() => {
    loadUnread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    if (!userId || queue.length === 0) return;
    setConfirming(true);
    const supabase = createClient();
    const current = queue[0];
    await supabase.from("notice_reads").insert({ notice_id: current.id, user_id: userId });
    setQueue((q) => q.slice(1));
    setConfirming(false);
  }

  if (queue.length === 0) return null;

  const current = queue[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <p className="text-xs font-medium text-blue-600 mb-1">공지사항{queue.length > 1 ? ` (${queue.length}건 중 1건)` : ""}</p>
        <h2 className="text-lg font-bold text-gray-900 mb-2">{current.title}</h2>
        <p className="text-xs text-gray-400 mb-4">{formatDateTime(current.created_at)}</p>
        <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto mb-6">
          {current.content}
        </div>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full rounded-lg bg-blue-600 text-white py-3 font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          확인했습니다
        </button>
      </div>
    </div>
  );
}
