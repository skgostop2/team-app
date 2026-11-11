"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import {
  DEFAULT_OT_SETTINGS,
  afterStartNow,
  missingDays,
  mustCheck,
  shortDay,
  type OtSettings,
  type OvertimeEntry,
} from "@/lib/overtime";
import { todayKey } from "@/lib/calendar";
import { addDays } from "@/lib/week";
import OvertimeEntryModal from "./OvertimeEntryModal";

/**
 * 잔업 체크 띠 — 주중에 안 넣은 날이 있으면 모든 화면 맨 위에 뜬다.
 * 닫는 버튼이 없다. 넣어야 사라진다 (「없음」 한 번이면 된다).
 * 16:30 이 지나면 오늘 것도 넣을 수 있게 조용한 버튼을 하나 더 보여준다.
 */
export default function OvertimeNag({ profile }: { profile: Profile }) {
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [settings, setSettings] = useState<OtSettings>(DEFAULT_OT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: s }, { data: e }] = await Promise.all([
      supabase.from("ot_settings").select("monthly_hours,start_date,slogan").eq("id", 1).maybeSingle(),
      supabase
        .from("overtime_entries")
        .select("*")
        .eq("user_id", profile.id)
        .gte("work_date", addDays(todayKey(), -20)),
    ]);
    if (s) setSettings(s as OtSettings);
    setEntries((e ?? []) as OvertimeEntry[]);
    setReady(true);
  }, [profile.id]);

  useEffect(() => {
    load();
    // 16:30 을 넘기면 「오늘」 버튼이 나타나도록 가끔 다시 그린다
    const t = setInterval(() => setTick((n) => n + 1), 5 * 60 * 1000);
    // 잔업 화면에서 넣었을 때도 띠가 바로 사라지게
    const onSaved = () => load();
    window.addEventListener("overtime-saved", onSaved);
    return () => {
      clearInterval(t);
      window.removeEventListener("overtime-saved", onSaved);
    };
  }, [load]);

  if (!ready || !mustCheck(profile)) return null;

  const missing = missingDays(entries, settings.start_date);
  const today = todayKey();
  const todayDone = entries.some((e) => e.work_date === today);
  const askToday = tick >= 0 && afterStartNow() && !todayDone && today >= settings.start_date &&
    [1, 2, 3, 4, 5].includes(new Date().getDay());

  if (missing.length === 0 && !askToday) return null;

  const urgent = missing.length > 0;
  /** 지난번에 고른 업무 — 창을 열면 미리 선택돼 있다 */
  const lastTaskId =
    [...entries].sort((x, y) => y.work_date.localeCompare(x.work_date)).find((e) => e.minutes > 0 && e.task_id)
      ?.task_id ?? null;

  /** 「없음」은 창 없이 한 번에 */
  async function none(dates: string[]) {
    if (busy || dates.length === 0) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("overtime_entries").upsert(
      dates.map((d) => ({ user_id: profile.id, work_date: d, minutes: 0, end_time: null, task_id: null, task_title: null, note: null })),
      { onConflict: "user_id,work_date" }
    );
    setBusy(false);
    if (error) {
      window.alert(
        error.message.includes("row-level security")
          ? "이 날짜는 이제 본인이 넣을 수 없습니다 (그 달 안 또는 7일 이내만). 팀장에게 말씀해 주세요."
          : `저장하지 못했습니다: ${error.message}`
      );
      return;
    }
    await load();
    window.dispatchEvent(new Event("overtime-saved"));
  }

  const rows = [...missing.map((d) => ({ d, today: false })), ...(askToday ? [{ d: today, today: true }] : [])];

  return (
    <>
      <div
        className={
          "no-print rounded-xl border-2 px-4 py-3 " +
          (urgent ? "border-red-400 bg-red-50" : "border-amber-300 bg-amber-50")
        }
        style={{ fontFamily: "'현대하모니 L', 'Hyundai Harmony L', Pretendard, sans-serif" }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl">⏱</span>
          <p className={"text-base font-bold " + (urgent ? "text-red-800" : "text-amber-900")}>잔업 체크</p>
          <p className="text-xs text-gray-600 break-keep">“{settings.slogan}”</p>
          {missing.length >= 2 && (
            <button
              onClick={() => none(missing)}
              disabled={busy}
              className="ml-auto rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-xs font-bold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              {missing.length}일 모두 없음
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {rows.map(({ d, today: isToday }) => (
            <div key={d} className="flex items-center gap-1.5">
              <span className={"text-sm font-bold whitespace-nowrap " + (isToday ? "text-amber-900" : "text-red-800")}>
                {isToday ? `오늘 ${shortDay(d)}` : shortDay(d)}
              </span>
              <button
                onClick={() => none([d])}
                disabled={busy}
                className="rounded-lg border-2 border-emerald-500 bg-white px-3.5 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                없음
              </button>
              <button
                onClick={() => setPick(d)}
                disabled={busy}
                className={
                  "rounded-lg px-3.5 py-2 text-sm font-bold text-white disabled:opacity-50 " +
                  (isToday ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700")
                }
              >
                했음
              </button>
            </div>
          ))}
        </div>
      </div>

      {pick && (
        <OvertimeEntryModal
          date={pick}
          userId={profile.id}
          existing={entries.find((e) => e.work_date === pick) ?? null}
          defaultTaskId={lastTaskId}
          slogan={settings.slogan}
          onClose={() => setPick(null)}
          onSaved={() => {
            setPick(null);
            load();
            window.dispatchEvent(new Event("overtime-saved"));
          }}
        />
      )}
    </>
  );
}
