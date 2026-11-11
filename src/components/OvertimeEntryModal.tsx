"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { END_OPTIONS, hours, shortDay, type OvertimeEntry } from "@/lib/overtime";
import { cn } from "@/lib/utils";

type TaskLite = { id: string; title: string; effective_status: string };

const FONT = { fontFamily: "'현대하모니 L', 'Hyundai Harmony L', Pretendard, sans-serif" } as const;

/**
 * 잔업 체크 창 — 하루치.
 *
 * 누르는 횟수를 줄인다: 「없음」은 한 번, 잔업이 있으면 끝난 시각 + 업무 두 번.
 * 업무를 꼭 고르게 하는 이유는 "몇 시간"이 아니라 "무슨 일 때문에"가 남게 하려는 것이다.
 */
export default function OvertimeEntryModal({
  date,
  userId,
  existing,
  defaultTaskId,
  slogan,
  onClose,
  onSaved,
}: {
  date: string;
  userId: string;
  existing?: OvertimeEntry | null;
  /** 지난번에 고른 업무 — 미리 선택해 둔다 (잔업은 대개 같은 일로 이어진다) */
  defaultTaskId?: string | null;
  slogan: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(existing ? existing.minutes : null);
  const [taskId, setTaskId] = useState<string | "etc" | null>(
    existing ? (existing.task_id ?? (existing.minutes > 0 ? "etc" : null)) : null
  );
  const [note, setNote] = useState(existing?.note ?? "");
  /** 21:30 뒤의 시각은 접어 둔다 (이미 늦은 시각으로 넣은 기록을 고칠 때는 펼친다) */
  const [late, setLate] = useState((existing?.minutes ?? 0) > 300);
  const [showNote, setShowNote] = useState(!!existing?.note);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("v_tasks")
        .select("id,title,effective_status,assignee_id,deputy_ids,completed_at")
        .order("created_at", { ascending: false });
      const mine = ((data ?? []) as (TaskLite & {
        assignee_id: string | null;
        deputy_ids: string[] | null;
        completed_at: string | null;
      })[])
        .filter((t) => t.assignee_id === userId || (t.deputy_ids ?? []).includes(userId))
        // 끝난 지 2주 넘은 것은 목록에서 뺀다 (지금 고쳐 넣는 기록의 업무는 남긴다)
        .filter(
          (t) =>
            t.effective_status !== "완료" ||
            t.id === existing?.task_id ||
            (t.completed_at && Date.now() - new Date(t.completed_at).getTime() < 14 * 86400000)
        )
        .sort((a, b) => Number(a.effective_status === "완료") - Number(b.effective_status === "완료"));
      setTasks(mine);
      // 새로 넣는 날이면 지난번 업무를 미리 골라 둔다 (목록에 아직 있을 때만)
      if (!existing && defaultTaskId && mine.some((t) => t.id === defaultTaskId)) {
        setTaskId((cur) => cur ?? defaultTaskId);
      }
    })();
  }, [userId, existing, defaultTaskId]);

  async function save(min: number) {
    setError(null);
    if (min > 0) {
      if (!taskId) return setError("무슨 업무 때문에 남았는지 골라 주세요.");
      if (taskId === "etc" && !note.trim())
        return setError("「기타」는 무슨 일이었는지 한 줄 적어 주세요.");
    }
    setBusy(true);
    const picked = tasks.find((t) => t.id === taskId);
    const end = END_OPTIONS.find((o) => o.minutes === min)?.label ?? null;
    const supabase = createClient();
    const { error: err } = await supabase.from("overtime_entries").upsert(
      {
        user_id: userId,
        work_date: date,
        minutes: min,
        end_time: min > 0 ? end : null,
        task_id: min > 0 && picked ? picked.id : null,
        task_title: min > 0 ? (picked ? picked.title : "기타") : null,
        note: min > 0 ? note.trim() || null : null,
      },
      { onConflict: "user_id,work_date" }
    );
    setBusy(false);
    if (err) {
      setError(
        err.message.includes("row-level security")
          ? "이 날짜는 이제 본인이 고칠 수 없습니다 (그 달 안 또는 7일 이내만). 팀장에게 말씀해 주세요."
          : err.message
      );
      return;
    }
    onSaved();
  }

  return (
    <div
      className="no-print fixed inset-0 z-[65] bg-black/60 flex items-end md:items-center justify-center p-0 md:p-4"
      style={FONT}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[92dvh] overflow-y-auto">
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{shortDay(date)} 잔업 체크</h3>
              <p className="text-xs text-gray-500 mt-0.5">16:30 부터 셉니다 · 30분 단위</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1">
              ×
            </button>
          </div>
          <p className="mt-2 text-sm font-medium text-blue-700 break-keep">“{slogan}”</p>
        </div>

        <div className="p-5 space-y-4">
          {/* 1. 없음 / 끝난 시각 */}
          <div>
            <button
              onClick={() => {
                setMinutes(0);
                save(0);
              }}
              disabled={busy}
              className={cn(
                "w-full rounded-xl border-2 py-3 text-base font-bold disabled:opacity-50",
                minutes === 0
                  ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              잔업 없음 (정시 퇴근)
            </button>
            <p className="text-sm font-bold text-gray-900 mt-4 mb-1.5">
              ① 잔업을 했다면 — 끝난 시각 <span className="font-normal text-xs text-gray-500">(누르기)</span>
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {(late ? END_OPTIONS : END_OPTIONS.slice(0, 10)).map((o) => (
                <button
                  key={o.label}
                  onClick={() => setMinutes(o.minutes)}
                  className={cn(
                    "rounded-lg border py-2 text-sm leading-tight",
                    minutes === o.minutes
                      ? "border-blue-600 bg-blue-600 text-white font-bold"
                      : "border-gray-300 text-gray-800 hover:bg-gray-50"
                  )}
                >
                  {o.label}
                  <span className="block text-[10px] opacity-75">{hours(o.minutes)}시간</span>
                </button>
              ))}
            </div>
            {!late && (
              <button onClick={() => setLate(true)} className="mt-1.5 text-xs text-gray-500 underline underline-offset-2">
                더 늦게 끝났어요 (22:00 이후)
              </button>
            )}
          </div>

          {/* 2. 무슨 업무 때문에 — 처음부터 보여준다 (시각을 눌러야 나타나면 "업무는 어디서 적지?" 하게 된다) */}
          <>
              <div>
                <p className="text-sm font-bold text-gray-900">② 무슨 업무 때문에 남았나요?</p>
                <p className="text-xs text-gray-500 mb-1.5 break-keep">
                  업무관리에 있는 내 업무에서 고르기만 합니다 — 새로 적지 않습니다
                </p>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {tasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTaskId(t.id)}
                      className={cn(
                        "w-full text-left px-3 py-2.5 text-sm break-keep",
                        taskId === t.id ? "bg-blue-50 text-blue-800 font-semibold" : "text-gray-800 hover:bg-gray-50"
                      )}
                    >
                      {taskId === t.id ? "● " : "○ "}
                      {t.title}
                      {t.effective_status === "완료" && <span className="ml-1 text-xs text-gray-400">(완료)</span>}
                    </button>
                  ))}
                  <button
                    onClick={() => setTaskId("etc")}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-sm",
                      taskId === "etc" ? "bg-amber-50 text-amber-900 font-semibold" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {taskId === "etc" ? "● " : "○ "}기타 — 목록에 없는 일
                  </button>
                </div>
              </div>
              {taskId === "etc" || showNote ? (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus={taskId === "etc"}
                  placeholder={taskId === "etc" ? "무슨 일이었는지 한 줄 (필수)" : "한 줄 메모"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                />
              ) : (
                <button onClick={() => setShowNote(true)} className="text-xs text-gray-500 underline underline-offset-2">
                  + 메모 추가 (안 써도 됩니다)
                </button>
              )}
              <button
                onClick={() => {
                  if (minutes && minutes > 0) save(minutes);
                }}
                disabled={busy || !minutes}
                className="w-full rounded-xl bg-gray-900 text-white py-3 text-base font-bold hover:bg-black disabled:opacity-50"
              >
                {busy ? "저장 중..." : minutes ? `${hours(minutes)}시간 저장` : "① 끝난 시각을 먼저 눌러 주세요"}
              </button>
          </>

          {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
        </div>
      </div>
    </div>
  );
}
