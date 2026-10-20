"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithEffectiveStatus } from "@/lib/types";
import { itemsFromText, percentOf, type TaskItem } from "@/lib/items";
import { cn } from "@/lib/utils";

/**
 * 진행률 창 — 세부 항목이 있으면 체크로, 없으면 슬라이더로.
 *
 * 두 가지가 같이 있으면 숫자가 따로 놀기 때문에, 항목이 하나라도 있으면
 * 진행률은 체크에서만 나온다 (서버에서도 같은 계산으로 다시 넣는다).
 *
 * 다 체크해도 완료로 바꾸지 않는다 — 끝났는지는 사람이 판단한다.
 */
export default function TaskItemsModal({
  task,
  canEdit,
  onClose,
  onChanged,
}: {
  task: TaskWithEffectiveStatus;
  /** 체크하고 항목을 고칠 수 있는 사람인지 (담당자·참여자·팀장·그룹장) */
  canEdit: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [manual, setManual] = useState(task.progress ?? 0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("task_items")
      .select("*")
      .eq("task_id", task.id)
      .order("idx", { ascending: true });
    if (err) setError(err.message);
    setItems((data ?? []) as TaskItem[]);
    setLoading(false);
  }, [task.id]);

  useEffect(() => {
    load();
  }, [load]);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total ? percentOf({ done, total }) : manual;

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    await load();
    onChanged?.();
    return true;
  }

  async function toggle(it: TaskItem) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await run(async () => {
      const { error } = await supabase
        .from("task_items")
        .update({
          done: !it.done,
          done_at: !it.done ? new Date().toISOString() : null,
          done_by: !it.done ? (user?.id ?? null) : null,
        })
        .eq("id", it.id);
      return { error };
    });
  }

  async function addOne() {
    const text = adding.trim();
    if (!text) return;
    const supabase = createClient();
    const ok = await run(async () => {
      const { error } = await supabase
        .from("task_items")
        .insert({ task_id: task.id, text, idx: total });
      return { error };
    });
    if (ok) setAdding("");
  }

  async function removeOne(it: TaskItem) {
    const supabase = createClient();
    await run(async () => {
      const { error } = await supabase.from("task_items").delete().eq("id", it.id);
      return { error };
    });
  }

  /** 상세내용에 적어 둔 1) 2) 3) 을 그대로 항목으로 */
  async function fromDescription() {
    const lines = itemsFromText(task.description ?? "");
    /*
      항목을 만들면 진행률은 체크 수로 다시 계산된다.
      이미 손으로 60% 라 적어 둔 업무가 말없이 0% 가 되면 당황스러우므로 먼저 묻는다.
    */
    if ((task.progress ?? 0) > 0 && lines.length > 0) {
      const ok = window.confirm(
        `항목 ${lines.length}개를 만듭니다.\n\n` +
          `진행률은 이제 체크한 항목 수로 계산되어 ${task.progress}% → 0% 에서 다시 시작합니다.\n` +
          `끝난 항목에 체크하시면 그만큼 올라갑니다.\n\n계속할까요?`
      );
      if (!ok) return;
    }
    if (lines.length === 0) {
      setError("상세내용에서 항목을 찾지 못했습니다. 1) 2) 또는 - 로 줄을 나눠 적어주세요.");
      return;
    }
    const supabase = createClient();
    await run(async () => {
      const { error } = await supabase
        .from("task_items")
        .insert(lines.map((text, i) => ({ task_id: task.id, text, idx: total + i })));
      return { error };
    });
  }

  /** 항목이 없을 때만 쓰는 수동 진행률 */
  async function saveManual() {
    const v = Math.max(0, Math.min(100, Math.round(manual)));
    const status = v >= 100 ? "완료" : v > 0 ? "진행중" : "대기";
    const supabase = createClient();
    const ok = await run(async () => {
      const { error } = await supabase.from("tasks").update({ progress: v, status }).eq("id", task.id);
      return { error };
    });
    if (ok) onClose();
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
            <h3 className="text-base font-bold text-gray-900">진행률</h3>
            <p className="text-xs text-gray-500 break-keep mt-0.5">{task.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
          >
            ×
          </button>
        </div>

        {/* 지금 몇 퍼센트인가 */}
        <div className="mt-3 flex items-center gap-3 shrink-0">
          <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xl font-bold text-gray-900 w-24 text-right whitespace-nowrap">
            {pct}%
            {total > 0 && (
              <span className="block text-xs font-normal text-gray-500">
                {done}/{total} 항목
              </span>
            )}
          </span>
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-keep shrink-0">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto mt-3 min-h-0">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">불러오는 중...</p>
          ) : total === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 break-keep">
                할 일이 여럿이면 <b>항목으로 나눠 체크</b>하시면 됩니다. 그러면 진행률이 체크한
                개수로 자동 계산되어, 보는 사람도 어디까지 됐는지 압니다.
              </p>

              {canEdit && (
                <>
                  <button
                    onClick={fromDescription}
                    disabled={busy}
                    className="w-full rounded-lg border border-blue-300 bg-blue-50 text-blue-700 py-2.5 font-medium hover:bg-blue-100 disabled:opacity-50"
                  >
                    상세내용에서 항목 만들기
                  </button>

                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs text-gray-500 mb-2">항목 없이 직접 조절</p>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={manual}
                        onChange={(e) => setManual(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-base font-bold text-gray-900 w-14 text-right">
                        {manual}%
                      </span>
                    </div>
                    <button
                      onClick={saveManual}
                      disabled={busy || manual === task.progress}
                      className="mt-2 w-full rounded-lg bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      저장
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  className={cn(
                    "flex items-start gap-2 rounded-lg px-2 py-2",
                    it.done ? "bg-emerald-50/60" : "hover:bg-gray-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={it.done}
                    disabled={!canEdit || busy}
                    onChange={() => toggle(it)}
                    className="w-5 h-5 mt-0.5 shrink-0"
                  />
                  <span
                    className={cn(
                      "flex-1 text-sm break-keep",
                      it.done ? "text-gray-400 line-through" : "text-gray-800"
                    )}
                  >
                    <span className="text-gray-400 mr-1">{i + 1})</span>
                    {it.text}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => removeOne(it)}
                      disabled={busy}
                      title="이 항목 지우기"
                      className="shrink-0 text-xs text-gray-300 hover:text-red-600 px-1"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canEdit && total > 0 && (
          <div className="shrink-0 pt-2 mt-2 border-t border-gray-100">
            <div className="flex gap-2">
              <input
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addOne();
                }}
                placeholder="항목 추가"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
              />
              <button
                onClick={addOne}
                disabled={busy || !adding.trim()}
                className="shrink-0 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 disabled:opacity-50"
              >
                추가
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-2 break-keep">
              진행률은 체크한 항목 수로 자동 계산됩니다. 다 체크해도 완료로 바뀌지는 않습니다 —
              완료는 표의 <b>완료 처리</b> 버튼으로 하십시오.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
