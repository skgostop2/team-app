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

  return (
    <>
      <div
        className={
          "no-print rounded-xl border-2 px-4 py-3 flex items-center gap-3 flex-wrap " +
          (urgent ? "border-red-400 bg-red-50" : "border-amber-300 bg-amber-50")
        }
        style={{ fontFamily: "'현대하모니 L', 'Hyundai Harmony L', Pretendard, sans-serif" }}
      >
        <span className="text-2xl">⏱</span>
        <div className="flex-1 min-w-[220px]">
          <p className={"text-base font-bold break-keep " + (urgent ? "text-red-800" : "text-amber-900")}>
            {urgent
              ? `잔업 체크를 안 한 날이 ${missing.length}일 있습니다`
              : "오늘 잔업을 체크해 주세요"}
          </p>
          <p className="text-xs text-gray-600 break-keep mt-0.5">
            잔업이 없었어도 「없음」을 눌러야 합니다 · “{settings.slogan}”
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {missing.map((d) => (
            <button
              key={d}
              onClick={() => setPick(d)}
              className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm font-bold hover:bg-red-700"
            >
              {shortDay(d)} 체크
            </button>
          ))}
          {askToday && (
            <button
              onClick={() => setPick(today)}
              className="rounded-lg bg-amber-500 text-white px-3 py-2 text-sm font-bold hover:bg-amber-600"
            >
              오늘 체크
            </button>
          )}
        </div>
      </div>

      {pick && (
        <OvertimeEntryModal
          date={pick}
          userId={profile.id}
          existing={entries.find((e) => e.work_date === pick) ?? null}
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
