"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * 진행률을 밀어 저장한 직후 화면 아래에 잠깐 뜨는 "한 줄 남기기".
 *
 * 진행기록이 거의 없는 이유는 쓸 자리가 안 보여서다. 막대를 민 그 순간에
 * 한 줄 칸을 내밀면 쓴다. 안 쓰면 그냥 넘어간다 — 강제가 아니다.
 * 15초 지나면 저절로 사라진다 (쓰던 중이면 안 사라진다).
 */
export default function QuickNoteToast({
  taskId,
  title,
  from,
  to,
  onDone,
}: {
  taskId: string;
  title: string;
  from: number;
  to: number;
  onDone: (saved: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // 아무것도 안 쓰면 15초 뒤 조용히 사라진다
  useEffect(() => {
    if (text) return;
    const t = setTimeout(() => onDone(false), 15000);
    return () => clearTimeout(t);
  }, [text, onDone]);

  async function save() {
    const body = text.trim();
    if (!body || saving) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("task_updates").insert({
      task_id: taskId,
      author_id: user?.id,
      content: body,
      progress_from: from,
      progress_to: to,
      kind: "기록",
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onDone(true);
  }

  return (
    <div className="no-print fixed inset-x-0 bottom-20 md:bottom-6 z-50 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-lg rounded-2xl bg-gray-900 text-white shadow-2xl p-3 md:p-4">
        <p className="text-xs text-gray-300 break-keep">
          <b className="text-white">{title}</b> · {from}% → <b className="text-emerald-300">{to}%</b>
        </p>
        <div className="mt-2 flex gap-2">
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") onDone(false);
            }}
            placeholder="무엇을 했는지 한 줄 (안 써도 됩니다)"
            className="flex-1 rounded-lg bg-white text-gray-900 px-3 py-2 text-base"
          />
          <button
            onClick={save}
            disabled={saving || !text.trim()}
            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold hover:bg-emerald-400 disabled:opacity-40"
          >
            {saving ? "..." : "남기기"}
          </button>
          <button
            onClick={() => onDone(false)}
            className="shrink-0 rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-800"
            title="기록 없이 넘어가기"
          >
            건너뛰기
          </button>
        </div>
        {error && <p className="mt-1 text-xs text-red-300 break-keep">{error}</p>}
      </div>
    </div>
  );
}
