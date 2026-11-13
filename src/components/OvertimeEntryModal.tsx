"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { END_OPTIONS, LATE_FROM_MIN, hours, otWork, shortDay, type OvertimeEntry } from "@/lib/overtime";
import { cn } from "@/lib/utils";

const FONT = { fontFamily: "'현대하모니 L', 'Hyundai Harmony L', Pretendard, sans-serif" } as const;

/**
 * 잔업 체크 창 — 하루치.
 *
 * 「없음」은 한 번. 잔업이 있으면 ① 끝난 시각을 누르고 ② 한 일을 직접 적는다.
 * 한 일은 고르는 게 아니라 적는다 (팀장 지시) — "몇 시간"이 아니라 "무슨 일을 했는지"가 남아야 한다.
 */
export default function OvertimeEntryModal({
  date,
  userId,
  existing,
  slogan,
  onClose,
  onSaved,
}: {
  date: string;
  userId: string;
  existing?: OvertimeEntry | null;
  slogan: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [minutes, setMinutes] = useState<number | null>(existing ? existing.minutes : null);
  /** 잔업 때 한 일 — 직접 적는다 (예전에 목록에서 고른 기록은 그 업무 이름을 넣어 둔다) */
  const [work, setWork] = useState(existing ? otWork(existing) : "");
  /** 21:30 뒤의 시각은 접어 둔다 (이미 늦은 시각으로 넣은 기록을 고칠 때는 펼친다) */
  const [late, setLate] = useState((existing?.minutes ?? 0) >= LATE_FROM_MIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(min: number) {
    setError(null);
    if (min > 0 && !work.trim()) return setError("잔업 때 한 일을 적어 주세요.");
    setBusy(true);
    const end = END_OPTIONS.find((o) => o.minutes === min)?.label ?? null;
    const supabase = createClient();
    const { error: err } = await supabase.from("overtime_entries").upsert(
      {
        user_id: userId,
        work_date: date,
        minutes: min,
        end_time: min > 0 ? end : null,
        task_id: null,
        task_title: null,
        note: min > 0 ? work.trim() : null,
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
              <p className="text-xs text-gray-500 mt-0.5">16:30 부터 셉니다 · 15분 단위</p>
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
            {/* 한 시간에 한 줄 — :00 :15 :30 :45 가 세로로 맞도록 */}
            <div className="space-y-1.5">
              {[...new Set(END_OPTIONS.map((o) => o.hour))]
                .filter((h) => late || h * 60 < 22 * 60)
                .map((h) => {
                  const row = END_OPTIONS.filter((o) => o.hour === h);
                  return (
                    <div key={h} className="flex items-center gap-1.5">
                      <span className="w-8 shrink-0 text-xs text-gray-500 text-right">{h}시</span>
                      <div className="grid grid-cols-4 gap-1.5 flex-1">
                        {[0, 15, 30, 45].map((m) => {
                          const o = row.find((x) => Number(x.label.slice(3)) === m);
                          if (!o) return <span key={m} />;
                          return (
                            <button
                              key={o.label}
                              onClick={() => setMinutes(o.minutes)}
                              className={cn(
                                "rounded-lg border py-1.5 text-sm leading-tight",
                                minutes === o.minutes
                                  ? "border-blue-600 bg-blue-600 text-white font-bold"
                                  : "border-gray-300 text-gray-800 hover:bg-gray-50"
                              )}
                            >
                              {o.label}
                              <span className="block text-[10px] opacity-75">{hours(o.minutes)}시간</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
            {!late && (
              <button onClick={() => setLate(true)} className="mt-1.5 text-xs text-gray-500 underline underline-offset-2">
                더 늦게 끝났어요 (22:00 이후)
              </button>
            )}
          </div>

          {/* 2. 잔업 때 한 일 — 직접 적는다 */}
          <div>
            <p className="text-sm font-bold text-gray-900 mb-1.5">
              ② 잔업 때 한 일 <span className="font-normal text-xs text-gray-500">(직접 적기 · 필수)</span>
            </p>
            <textarea
              value={work}
              onChange={(e) => {
                setWork(e.target.value);
                if (error) setError(null);
              }}
              rows={2}
              maxLength={300}
              placeholder="예) ○○ 라인 테스트 대응, △△ 보고서 작성"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base text-gray-900 bg-white"
            />
          </div>
          <button
            onClick={() => {
              if (minutes && minutes > 0) save(minutes);
            }}
            disabled={busy || !minutes}
            className="w-full rounded-xl bg-gray-900 text-white py-3 text-base font-bold hover:bg-black disabled:opacity-50"
          >
            {busy ? "저장 중..." : minutes ? `${hours(minutes)}시간 저장` : "① 끝난 시각을 먼저 눌러 주세요"}
          </button>

          {error && <p className="text-sm text-red-600 break-keep">{error}</p>}
        </div>
      </div>
    </div>
  );
}
