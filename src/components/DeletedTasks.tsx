"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { cn, formatShortDate } from "@/lib/utils";

/**
 * 지워진 업무 — 누가 무엇을 언제 지웠는지.
 *
 * 업무를 지우면 그 자리에서는 사라지지만 기록은 남는다(deleted_tasks).
 * 그동안 그 기록을 볼 화면이 없어서, 팀원이 지시받은 업무를 지워도
 * 팀장은 알 길이 없었다. 이 칸이 그 자리다.
 *
 * 되살리기: 지울 때 떠 둔 사본을 그대로 다시 넣는다.
 * 다만 진행기록·변경이력은 업무와 함께 지워져 돌아오지 않는다 —
 * 그래서 되살린 업무에는 그 점을 적어 둔다.
 */

type DeletedRow = {
  id: string;
  title: string;
  assignee_name: string | null;
  instructor: string | null;
  status: string | null;
  progress: number | null;
  created_at: string | null;
  snapshot: Record<string, unknown> | null;
  history_count: number | null;
  update_count: number | null;
  deleted_by: string | null;
  deleted_at: string;
};

/** 되살릴 때 tasks 에 그대로 넣을 수 있는 칸만 추린다 (표에 없는 칸이 섞이면 통째로 실패한다) */
const RESTORE_KEYS = [
  "id",
  "title",
  "description",
  "note",
  "source",
  "status",
  "progress",
  "start_date",
  "due_date",
  "completed_at",
  "confirmed_at",
  "assignee_id",
  "deputy_ids",
  "instructor",
  "created_by",
  "created_at",
  "batch_id",
] as const;

export default function DeletedTasks({ profiles }: { profiles: Profile[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DeletedRow[]>([]);
  const [alive, setAlive] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("deleted_tasks")
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(200);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as DeletedRow[];
    setRows(list);

    // 되살려 놓은 것은 "지워진 업무"가 아니므로 표시를 달리한다
    if (list.length) {
      const { data: back } = await supabase
        .from("tasks")
        .select("id")
        .in("id", list.map((r) => r.id));
      setAlive(new Set(((back ?? []) as { id: string }[]).map((b) => b.id)));
    } else {
      setAlive(new Set());
    }
    setLoading(false);
  }, []);

  /** 펴는 순간에만 불러온다 (닫혀 있는 칸 때문에 매번 조회할 이유가 없다) */
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows.length === 0 && !loading) load();
  }

  function who(id: string | null): string {
    if (!id) return "알 수 없음";
    return profiles.find((p) => p.id === id)?.name ?? "알 수 없음";
  }

  async function restore(row: DeletedRow) {
    const snap = row.snapshot;
    if (!snap || typeof snap !== "object") {
      setError("되살릴 사본이 없습니다.");
      return;
    }
    const ok = window.confirm(
      `「${row.title}」 을(를) 되살립니다.\n\n` +
        `업무는 지우기 전 내용 그대로 돌아옵니다.\n` +
        `다만 진행기록과 변경이력은 함께 지워져 돌아오지 않습니다.`
    );
    if (!ok) return;

    const fields: Record<string, unknown> = {};
    for (const k of RESTORE_KEYS) {
      if (k in snap) fields[k] = (snap as Record<string, unknown>)[k];
    }
    fields.id = row.id;

    setBusy(row.id);
    const supabase = createClient();
    const { error: err } = await supabase.from("tasks").insert(fields);
    setBusy(null);
    if (err) {
      setError(`되살리지 못했습니다: ${err.message}`);
      return;
    }
    await load();
  }

  const live = rows.filter((r) => !alive.has(r.id));

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden no-print">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 flex-wrap"
      >
        <span className="font-bold text-gray-900">지워진 업무</span>
        {rows.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {live.length}건
          </span>
        )}
        <span className="text-xs text-gray-400 break-keep">
          누가 무엇을 언제 지웠는지 남습니다
        </span>
        <span className="flex-1" />
        <span className="text-sm text-gray-400">{open ? "접기" : "펴기"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {error && (
            <p className="px-4 py-2.5 text-sm text-red-700 bg-red-50 border-b border-red-100 break-keep">
              {error}
            </p>
          )}

          {loading && <p className="px-4 py-6 text-sm text-gray-400">불러오는 중…</p>}

          {!loading && rows.length === 0 && (
            <p className="px-4 py-6 text-sm text-gray-400">지워진 업무가 없습니다.</p>
          )}

          {!loading &&
            rows.map((r) => {
              const back = alive.has(r.id);
              return (
                <div
                  key={`${r.id}-${r.deleted_at}`}
                  className="px-4 py-3 border-b border-gray-100 last:border-0 flex items-start gap-3 flex-wrap"
                >
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-medium text-gray-900 break-keep">
                      {r.title}
                      {back && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-normal">
                          되살림
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 break-keep">
                      담당 {r.assignee_name || "미지정"} · 지울 때 {r.status ?? "-"}{" "}
                      {r.progress ?? 0}%
                      {r.update_count ? ` · 진행기록 ${r.update_count}건` : ""}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {who(r.deleted_by)} 님이 {formatShortDate(r.deleted_at)}{" "}
                      {new Date(r.deleted_at).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      에 지움
                    </p>
                  </div>

                  {!back && (
                    <button
                      onClick={() => restore(r)}
                      disabled={busy === r.id}
                      className={cn(
                        "shrink-0 text-xs px-3 py-2 rounded-lg border border-blue-300 text-blue-700",
                        "hover:bg-blue-50 disabled:opacity-50"
                      )}
                    >
                      {busy === r.id ? "되살리는 중…" : "되살리기"}
                    </button>
                  )}
                </div>
              );
            })}

          {!loading && rows.length > 0 && (
            <p className="px-4 py-2.5 text-xs text-gray-400 break-keep border-t border-gray-100">
              되살리면 업무는 지우기 전 내용 그대로 돌아옵니다. 진행기록과 변경이력은 업무와 함께
              지워져 돌아오지 않습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
