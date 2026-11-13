"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import { byDisplayOrder, isManager, isTeamLead } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { todayKey } from "@/lib/calendar";
import { addDays, mondayOf } from "@/lib/week";
import {
  DEFAULT_OT_SETTINGS,
  daysOfMonth,
  hours,
  isWorkday,
  limitTone,
  monthKey,
  mustCheck,
  otWork,
  selfEditable,
  shiftMonthKey,
  shortDay,
  sumMinutes,
  weeksOfMonth,
  type OtSettings,
  type OvertimeEntry,
} from "@/lib/overtime";
import { exportOvertime } from "@/lib/exportXlsx";
import OvertimeEntryModal from "@/components/OvertimeEntryModal";
import PrintButton from "@/components/PrintButton";

const FONT = { fontFamily: "'현대하모니 L', 'Hyundai Harmony L', Pretendard, sans-serif" } as const;

/**
 * 잔업(OT) 화면.
 *
 * 누구나: 내 잔업 — 이번 주·이번 달·올해·전체 누적, 날짜별 내역.
 * 팀장·상무: 팀 전체 — 사람 × 날짜 표, 주·월 합계, 안 넣은 칸, 잔업이 많이 든 업무.
 * 팀원끼리는 서로의 잔업이 보이지 않는다 (서버가 막는다).
 */
export default function OvertimePage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [entries, setEntries] = useState<OvertimeEntry[]>([]);
  const [settings, setSettings] = useState<OtSettings>(DEFAULT_OT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [ym, setYm] = useState(() => monthKey(todayKey()));
  const [pick, setPick] = useState<{ userId: string; date: string } | null>(null);
  const [editSlogan, setEditSlogan] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: p }, { data: all }, { data: e }, { data: s }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("profiles").select("*").order("name"),
      // 팀원에게는 서버가 본인 것만 내려준다
      supabase.from("overtime_entries").select("*").order("work_date", { ascending: true }),
      supabase.from("ot_settings").select("monthly_hours,start_date,slogan").eq("id", 1).maybeSingle(),
    ]);
    setMe(p as Profile);
    setProfiles((all ?? []) as Profile[]);
    setEntries((e ?? []) as OvertimeEntry[]);
    if (s) setSettings(s as OtSettings);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const onSaved = () => load();
    window.addEventListener("overtime-saved", onSaved);
    return () => window.removeEventListener("overtime-saved", onSaved);
  }, [load]);

  const today = todayKey();
  const lead = isManager(me);
  const days = useMemo(() => daysOfMonth(ym), [ym]);
  const workdays = useMemo(() => days.filter(isWorkday), [days]);
  const weeks = useMemo(() => weeksOfMonth(ym), [ym]);

  const byKey = useMemo(() => {
    const m = new Map<string, OvertimeEntry>();
    for (const e of entries) m.set(`${e.user_id}|${e.work_date}`, e);
    return m;
  }, [entries]);

  const mine = useMemo(() => entries.filter((e) => e.user_id === me?.id), [entries, me?.id]);
  const weekStart = mondayOf(today);
  const myWeek = sumMinutes(mine.filter((e) => e.work_date >= weekStart && e.work_date <= addDays(weekStart, 6)));
  const myMonth = sumMinutes(mine.filter((e) => e.work_date.startsWith(monthKey(today))));
  const myYear = sumMinutes(mine.filter((e) => e.work_date.startsWith(today.slice(0, 4))));
  const myAll = sumMinutes(mine);
  const myViewMonth = sumMinutes(mine.filter((e) => e.work_date.startsWith(ym)));

  /** 그 날이 "넣어야 하는데 안 넣은 날"인가 */
  const isMissing = (userId: string, d: string) =>
    isWorkday(d) && d >= settings.start_date && d < today && !byKey.has(`${userId}|${d}`);

  const people = useMemo(
    () => profiles.filter(mustCheck).sort(byDisplayOrder),
    [profiles]
  );
  const totalByUser = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) m.set(e.user_id, (m.get(e.user_id) ?? 0) + e.minutes);
    return m;
  }, [entries]);

  /** 이번 달 잔업이 많이 든 업무 */
  const topTasks = useMemo(() => {
    const m = new Map<string, { title: string; minutes: number; who: Set<string> }>();
    for (const e of entries) {
      if (!e.work_date.startsWith(ym) || e.minutes <= 0) continue;
      // 직접 적은 글이라 같은 일도 표현이 조금씩 다를 수 있다 — 글자가 같은 것끼리만 묶는다
      const title = otWork(e) || "(적지 않음)";
      const k = title;
      const cur = m.get(k) ?? { title, minutes: 0, who: new Set<string>() };
      cur.minutes += e.minutes;
      cur.who.add(e.user_id);
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5);
  }, [entries, ym]);

  async function saveSettings(patch: Partial<OtSettings>) {
    const supabase = createClient();
    const { error } = await supabase
      .from("ot_settings")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) return window.alert(`저장하지 못했습니다: ${error.message}`);
    setSettings((s) => ({ ...s, ...patch }));
  }

  /** 「없음」은 창 없이 한 번에 */
  async function quickNone(userId: string, d: string) {
    const supabase = createClient();
    const { error } = await supabase.from("overtime_entries").upsert(
      { user_id: userId, work_date: d, minutes: 0, end_time: null, task_id: null, task_title: null, note: null },
      { onConflict: "user_id,work_date" }
    );
    if (error)
      return window.alert(
        error.message.includes("row-level security")
          ? "이 날짜는 이제 본인이 넣을 수 없습니다 (그 달 안 또는 7일 이내만). 팀장에게 말씀해 주세요."
          : `저장하지 못했습니다: ${error.message}`
      );
    await load();
    window.dispatchEvent(new Event("overtime-saved"));
  }

  async function toggleExempt(p: Profile) {
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ ot_exempt: !p.ot_exempt }).eq("id", p.id);
    if (error) return window.alert(`바꾸지 못했습니다: ${error.message}`);
    load();
  }

  if (loading || !me) return <p className="text-sm text-gray-400">불러오는 중...</p>;

  const nameOf = (id: string) => profiles.find((p) => p.id === id)?.name ?? "-";
  const tone = limitTone(myMonth, settings.monthly_hours);
  const pct = Math.min(100, (myMonth / (settings.monthly_hours * 60 || 1)) * 100);
  const [yy, mm] = ym.split("-").map(Number);

  return (
    <div className="space-y-5" style={FONT}>
      {/* 머리 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{lead ? "잔업 현황" : "내 잔업"}</h1>
          {editSlogan !== null ? (
            <span className="flex gap-1.5 mt-1">
              <input
                value={editSlogan}
                onChange={(e) => setEditSlogan(e.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm w-80 max-w-full"
              />
              <button
                onClick={async () => {
                  if (editSlogan.trim()) await saveSettings({ slogan: editSlogan.trim() });
                  setEditSlogan(null);
                }}
                className="text-xs px-2.5 rounded-lg bg-gray-900 text-white"
              >
                저장
              </button>
            </span>
          ) : (
            <p className="text-sm font-medium text-blue-700 mt-0.5 break-keep">
              “{settings.slogan}”
              {lead && (
                <button
                  onClick={() => setEditSlogan(settings.slogan)}
                  className="no-print ml-2 text-xs text-gray-400 underline underline-offset-2"
                >
                  문구 고치기
                </button>
              )}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1 break-keep">
            잔업은 16:30 부터 15분 단위로 셉니다. 잔업이 없던 날도 「없음」을 눌러 둡니다.
          </p>
        </div>
        <div className="no-print flex items-center gap-2">
          <button onClick={() => setYm(shiftMonthKey(ym, -1))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            ‹ 이전 달
          </button>
          <span className="text-base font-bold text-gray-900 whitespace-nowrap">
            {yy}년 {mm}월
          </span>
          <button onClick={() => setYm(shiftMonthKey(ym, 1))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            다음 달 ›
          </button>
          <PrintButton />
        </div>
      </div>

      <div className="flex flex-col gap-5">
      {/* ── 내 잔업 ── */}
      {mustCheck(me) && (
        <section className={cn("space-y-3", lead && "order-2")}>
          {lead && <h2 className="text-lg font-bold text-gray-900 pt-2">내 잔업</h2>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="이번 주" value={`${hours(myWeek)}시간`} />
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs text-gray-500">
                이번 달 <span className="text-gray-400">/ 기준 {settings.monthly_hours}시간</span>
              </p>
              <p
                className={cn(
                  "text-2xl font-bold mt-0.5",
                  tone === "over" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900"
                )}
              >
                {hours(myMonth)}시간
              </p>
              <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn("h-full", tone === "over" ? "bg-red-500" : tone === "warn" ? "bg-amber-500" : "bg-blue-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <Stat label={`${today.slice(0, 4)}년 누적`} value={`${hours(myYear)}시간`} />
            <Stat label="전체 누적" value={`${hours(myAll)}시간`} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <div className="px-4 py-2.5 border-b border-gray-200 flex items-baseline justify-between">
              <h2 className="text-base font-bold text-gray-900">
                {mm}월 내 잔업 <span className="text-sm font-normal text-gray-500">합계 {hours(myViewMonth)}시간</span>
              </h2>
            </div>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="px-3 py-2 text-left w-28">날짜</th>
                  <th className="px-3 py-2 text-center w-20">끝난 시각</th>
                  <th className="px-3 py-2 text-center w-16">시간</th>
                  <th className="px-3 py-2 text-left">잔업 때 한 일</th>
                  <th className="px-3 py-2 text-center w-32">비고</th>
                </tr>
              </thead>
              <tbody>
                {workdays
                  // 시작일 전 날짜는 물어본 적이 없으므로 줄을 세우지 않는다 (기록이 있으면 보여준다)
                  .filter((d) => d <= today && (d >= settings.start_date || byKey.has(`${me.id}|${d}`)))
                  .map((d) => {
                    const e = byKey.get(`${me.id}|${d}`);
                    const miss = isMissing(me.id, d);
                    return (
                      <tr key={d} className={cn("border-t border-gray-100", miss && "bg-red-50")}>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-800">{shortDay(d)}</td>
                        <td className="px-3 py-2 text-center text-gray-700">{e ? (e.minutes > 0 ? e.end_time : "없음") : ""}</td>
                        <td className="px-3 py-2 text-center font-semibold text-gray-900">
                          {e ? (e.minutes > 0 ? hours(e.minutes) : "—") : ""}
                        </td>
                        <td className="px-3 py-2 break-keep text-gray-800">{e ? otWork(e) : ""}</td>
                        <td className="px-3 py-2 text-center">
                          {!lead && !selfEditable(d) ? (
                            // 본인이 넣을 수 있는 기간이 지난 날 — 버튼을 두면 눌러도 저장이 안 된다
                            <span className="text-xs text-gray-500 break-keep">
                              {e ? "기간 지남" : "팀장에게 말씀"}
                            </span>
                          ) : e ? (
                            <button
                              onClick={() => setPick({ userId: me.id, date: d })}
                              className="no-print text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
                            >
                              고치기
                            </button>
                          ) : (
                            <span className="no-print inline-flex gap-1">
                              <button
                                onClick={() => quickNone(me.id, d)}
                                className="text-xs px-2.5 py-1 rounded-lg border-2 border-emerald-500 text-emerald-700 font-bold hover:bg-emerald-50"
                              >
                                없음
                              </button>
                              <button
                                onClick={() => setPick({ userId: me.id, date: d })}
                                className={cn(
                                  "text-xs px-2.5 py-1 rounded-lg text-white font-bold",
                                  miss ? "bg-red-600" : "bg-amber-500"
                                )}
                              >
                                했음
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                {workdays.filter((d) => d <= today && (d >= settings.start_date || byKey.has(`${me.id}|${d}`))).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                      아직 이 달의 근무일이 없습니다
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 팀 전체 (팀장·상무) ── */}
      {lead && (
        <section className="space-y-3 order-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">팀 전체 — {mm}월</h2>
            <div className="no-print flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-500">월 기준</span>
              {limitDraft !== null ? (
                <>
                  <input
                    value={limitDraft}
                    onChange={(e) => setLimitDraft(e.target.value)}
                    inputMode="decimal"
                    className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-sm text-center"
                  />
                  <button
                    onClick={async () => {
                      const n = Number(limitDraft);
                      if (Number.isFinite(n) && n > 0) await saveSettings({ monthly_hours: n });
                      setLimitDraft(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-gray-900 text-white"
                  >
                    저장
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setLimitDraft(String(settings.monthly_hours))}
                  className="px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-800 font-bold"
                  title="눌러서 기준 시간을 바꿉니다"
                >
                  {settings.monthly_hours}시간
                </button>
              )}
              <button
                onClick={() =>
                  exportOvertime({
                    ym,
                    days: workdays,
                    people: people.map((p) => ({ id: p.id, name: p.name })),
                    entries,
                    totalByUser,
                  })
                }
                className="px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 font-medium"
              >
                엑셀
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto print-table">
            <table className="text-sm border-collapse w-full min-w-[860px]">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 z-10 min-w-[76px]">이름</th>
                  {weeks.map((w) => (
                    <WeekHead key={w.monday} days={w.days} today={today} />
                  ))}
                  <th className="px-2 py-2 text-center border-l-2 border-gray-300 min-w-[64px]">월 합계</th>
                  <th className="px-2 py-2 text-center min-w-[56px]">누적</th>
                  <th className="px-2 py-2 text-center min-w-[72px]">비고</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const monthMin = sumMinutes(entries.filter((e) => e.user_id === p.id && e.work_date.startsWith(ym)));
                  const t = limitTone(monthMin, settings.monthly_hours);
                  const missCount = workdays.filter((d) => isMissing(p.id, d)).length;
                  return (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-semibold text-gray-900 whitespace-nowrap sticky left-0 bg-white z-10">
                        {p.name}
                      </td>
                      {weeks.map((w) => {
                        const wk = sumMinutes(w.days.map((d) => byKey.get(`${p.id}|${d}`)).filter(Boolean) as OvertimeEntry[]);
                        return (
                          <WeekCells
                            key={w.monday}
                            days={w.days}
                            weekMinutes={wk}
                            cell={(d) => {
                              const e = byKey.get(`${p.id}|${d}`);
                              const miss = isMissing(p.id, d);
                              return (
                                <button
                                  onClick={() => setPick({ userId: p.id, date: d })}
                                  disabled={d > today}
                                  title={
                                    e
                                      ? e.minutes > 0
                                        ? `${shortDay(d)} · ~${e.end_time} · ${otWork(e)}`
                                        : `${shortDay(d)} · 잔업 없음`
                                      : miss
                                        ? `${shortDay(d)} · 안 넣음`
                                        : shortDay(d)
                                  }
                                  className={cn(
                                    "w-full h-7 text-xs rounded",
                                    // 1.25 처럼 네 글자면 칸을 넘지 않게 조금 줄인다
                                    e && hours(e.minutes).length >= 4 && "text-[10px] tracking-tighter",
                                    miss && "bg-red-100 text-red-700 font-bold",
                                    e && e.minutes > 0 && "bg-blue-50 text-blue-800 font-semibold",
                                    e && e.minutes === 0 && "text-gray-300",
                                    d <= today && "hover:ring-1 hover:ring-blue-400"
                                  )}
                                >
                                  {e ? (e.minutes > 0 ? hours(e.minutes) : "·") : miss ? "미" : ""}
                                </button>
                              );
                            }}
                          />
                        );
                      })}
                      <td
                        className={cn(
                          "px-2 py-1.5 text-center font-bold border-l-2 border-gray-300",
                          t === "over" ? "bg-red-100 text-red-700" : t === "warn" ? "bg-amber-100 text-amber-800" : "text-gray-900"
                        )}
                      >
                        {hours(monthMin)}
                      </td>
                      <td className="px-2 py-1.5 text-center text-gray-600">{hours(totalByUser.get(p.id) ?? 0)}</td>
                      <td className="px-2 py-1.5 text-center text-xs">
                        {missCount > 0 ? (
                          <span className="text-red-600 font-bold">미입력 {missCount}</span>
                        ) : t === "over" ? (
                          <span className="text-red-600">기준 초과</span>
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  );
                })}
                {/* 합계 줄 */}
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="px-3 py-2 sticky left-0 bg-gray-50 z-10">합계</td>
                  {weeks.map((w) => {
                    const wk = sumMinutes(entries.filter((e) => w.days.includes(e.work_date) && people.some((p) => p.id === e.user_id)));
                    return (
                      <WeekCells
                        key={w.monday}
                        days={w.days}
                        weekMinutes={wk}
                        cell={(d) => {
                          const s = sumMinutes(entries.filter((e) => e.work_date === d && people.some((p) => p.id === e.user_id)));
                          return <span className="block text-center text-xs text-gray-600">{s > 0 ? hours(s) : ""}</span>;
                        }}
                      />
                    );
                  })}
                  <td className="px-2 py-2 text-center border-l-2 border-gray-300">
                    {hours(sumMinutes(entries.filter((e) => e.work_date.startsWith(ym) && people.some((p) => p.id === e.user_id))))}
                  </td>
                  <td className="px-2 py-2 text-center text-gray-600">
                    {hours(sumMinutes(entries.filter((e) => people.some((p) => p.id === e.user_id))))}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 break-keep">
            숫자 = 잔업 시간 · <span className="text-gray-400">·</span> = 없음(정시 퇴근) ·{" "}
            <span className="text-red-600 font-bold">미</span> = 안 넣음 · 칸에 마우스를 올리면 적은 내용(한 일)이 보이고, 누르면
            고칠 수 있습니다. 월 합계는 기준의 80%부터 노랑, 넘으면 빨강입니다.
          </p>

          {/* 잔업이 많이 든 업무 — 시간을 줄이려면 사람이 아니라 이 일을 본다 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-base font-bold text-gray-900">{mm}월 잔업이 많이 든 일</h3>
            {topTasks.length === 0 ? (
              <p className="text-sm text-gray-400 mt-2">아직 기록된 잔업이 없습니다</p>
            ) : (
              <table className="w-full text-sm mt-2">
                <thead>
                  <tr className="text-xs text-gray-500 text-left">
                    <th className="py-1 w-8">#</th>
                    <th className="py-1">잔업 때 한 일 (적은 그대로)</th>
                    <th className="py-1 w-20 text-right">시간</th>
                    <th className="py-1 pl-4">비고 (누가)</th>
                  </tr>
                </thead>
                <tbody>
                  {topTasks.map((t, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="py-1.5 text-gray-400">{i + 1}</td>
                      <td className="py-1.5 break-keep text-gray-900">{t.title}</td>
                      <td className="py-1.5 text-right font-bold text-gray-900">{hours(t.minutes)}</td>
                      <td className="py-1.5 pl-4 text-gray-600 break-keep">{[...t.who].map(nameOf).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 대상 */}
          <details className="no-print bg-white rounded-xl border border-gray-200 p-4">
            <summary className="text-sm font-bold text-gray-900 cursor-pointer">
              체크 대상 ({people.length}명) · 시작일 {settings.start_date}
            </summary>
            <p className="text-xs text-gray-500 mt-2 break-keep">
              상무(실장)는 대상이 아닙니다. 테스트 계정처럼 빼야 할 사람은 체크를 풀어 주세요.
              {!isTeamLead(me) && " (바꾸는 것은 팀장·상무만)"}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {profiles
                .filter((p) => p.status === "승인" && p.role !== "실장")
                .sort(byDisplayOrder)
                .map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <input type="checkbox" checked={!p.ot_exempt} onChange={() => toggleExempt(p)} className="w-4 h-4" />
                    {p.name}
                  </label>
                ))}
            </div>
          </details>
        </section>
      )}

      </div>

      {pick && (
        <OvertimeEntryModal
          date={pick.date}
          userId={pick.userId}
          existing={byKey.get(`${pick.userId}|${pick.date}`) ?? null}
          slogan={settings.slogan}
          onClose={() => setPick(null)}
          onSaved={() => {
            setPick(null);
            load();
            window.dispatchEvent(new Event("overtime-saved"));
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-0.5 text-gray-900">{value}</p>
    </div>
  );
}

/** 한 주의 머리칸 — 날짜들 + 「주」 합계 */
function WeekHead({ days, today }: { days: string[]; today: string }) {
  return (
    <>
      {days.map((d, i) => (
        <th
          key={d}
          className={cn(
            "px-0 py-2 text-center font-normal min-w-[24px]",
            i === 0 && "border-l border-gray-300",
            d === today && "text-blue-700 font-bold"
          )}
        >
          {Number(d.slice(8))}
          <span className="block text-[10px] text-gray-400">{"일월화수목금토"[new Date(d + "T00:00:00").getDay()]}</span>
        </th>
      ))}
      <th className="px-0.5 py-2 text-center min-w-[32px] bg-gray-100">주</th>
    </>
  );
}

function WeekCells({
  days,
  weekMinutes,
  cell,
}: {
  days: string[];
  weekMinutes: number;
  cell: (d: string) => React.ReactNode;
}) {
  return (
    <>
      {days.map((d, i) => (
        <td key={d} className={cn("px-px py-1", i === 0 && "border-l border-gray-300")}>
          {cell(d)}
        </td>
      ))}
      <td className="px-1 py-1 text-center text-xs font-bold bg-gray-50 text-gray-800">
        {weekMinutes > 0 ? hours(weekMinutes) : ""}
      </td>
    </>
  );
}
