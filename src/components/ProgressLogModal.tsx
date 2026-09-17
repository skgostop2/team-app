"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, TaskUpdate, TaskWithEffectiveStatus } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

/**
 * 진행기록 창.
 *
 * 업무가 어떻게 되어가는지 그때그때 한 줄 적어 쌓는다.
 * 비고는 "지금 상태" 한 줄이고 덮어써지지만, 진행기록은 경과가 남는다.
 * 기록은 지우지 않는다.
 */
export default function ProgressLogModal({
  task,
  profiles,
  canWrite,
  onClose,
  onChanged,
}: {
  task: TaskWithEffectiveStatus;
  profiles: Profile[];
  canWrite: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [logs, setLogs] = useState<TaskUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [withProgress, setWithProgress] = useState(false);
  const [nextProgress, setNextProgress] = useState(task.progress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("task_updates")
      .select("*")
      .eq("task_id", task.id)
      .order("created_at", { ascending: false });
    setLogs((data ?? []) as TaskUpdate[]);
    setLoading(false);
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load]);

  const nameOf = (id: string | null) =>
    profiles.find((p) => p.id === id)?.name ?? "(삭제된 계정)";

  async function add() {
    if (!content.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("로그인이 필요합니다.");
      setSaving(false);
      return;
    }

    const { error: err } = await supabase.from("task_updates").insert({
      task_id: task.id,
      author_id: user.id,
      content: content.trim(),
      progress_from: withProgress ? task.progress : null,
      progress_to: withProgress ? nextProgress : null,
    });

    if (err) {
      // 저장 실패 시 쓴 글을 지우지 않는다
      setError(err.message);
      setSaving(false);
      return;
    }

    // 진행률을 같이 올린 경우 업무의 진행률도 함께 바꾼다
    if (withProgress && nextProgress !== task.progress) {
      const status =
        nextProgress >= 100 ? "완료" : nextProgress > 0 ? "진행중" : "대기";
      await supabase
        .from("tasks")
        .update({ progress: nextProgress, status })
        .eq("id", task.id);
    }

    setContent("");
    setWithProgress(false);
    setSaving(false);
    await load();
    onChanged?.();
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full md:max-w-xl rounded-t-2xl md:rounded-2xl p-4 md:p-5 h-[88dvh] md:h-auto md:max-h-[88dvh] flex flex-col">
        <div className="flex items-start justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 break-keep">진행기록</h3>
            <p className="text-xs text-gray-500 break-keep mt-0.5">{task.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {canWrite && (
          <div className="mt-3 rounded-lg border border-gray-200 p-3 shrink-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="오늘 뭘 했는지, 어디까지 갔는지 한 줄 적으세요"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
            />

            <label className="flex items-center gap-2 text-xs text-gray-600 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={withProgress}
                onChange={(e) => {
                  setWithProgress(e.target.checked);
                  setNextProgress(task.progress);
                }}
                className="w-3.5 h-3.5"
              />
              진행률도 함께 올리기
            </label>

            {withProgress && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-500 w-12">{task.progress}% →</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={nextProgress}
                  onChange={(e) => setNextProgress(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-bold text-gray-900 w-12 text-right">
                  {nextProgress}%
                </span>
              </div>
            )}

            {error && <p className="text-sm text-red-600 mt-2 break-keep">{error}</p>}

            <button
              onClick={add}
              disabled={saving || !content.trim()}
              className="mt-2 w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "기록 중..." : "기록 추가"}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto mt-3 min-h-0">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">불러오는 중...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center break-keep">
              아직 기록이 없습니다.
              {canWrite && " 위에 한 줄 적어 시작하세요."}
            </p>
          ) : (
            <ul className="space-y-0">
              {logs.map((l, i) => (
                <li
                  key={l.id}
                  className={cn(
                    "py-2.5 border-b border-gray-100 last:border-0",
                    i === 0 && "bg-blue-50/40 -mx-2 px-2 rounded"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">
                      {formatDateTime(l.created_at)} · {nameOf(l.author_id)}
                      {l.edited_at && <span className="text-gray-400"> (수정됨)</span>}
                    </span>
                    {l.progress_to != null && (
                      <span className="text-xs font-medium text-blue-700 whitespace-nowrap">
                        {l.progress_from ?? 0}% → {l.progress_to}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-keep">
                    {l.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-[11px] text-gray-400 pt-2 shrink-0 break-keep">
          기록은 지워지지 않습니다. 나중에 경과를 되짚을 때 쓰입니다.
        </p>
      </div>
    </div>
  );
}
