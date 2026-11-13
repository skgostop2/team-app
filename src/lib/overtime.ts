import { addDays, mondayOf } from "./week";
import { todayKey } from "./calendar";
import type { Profile } from "./types";

/**
 * 잔업(OT) 계산.
 *
 * 잔업은 16:30 부터 센다. 끝난 시각만 고르면 시간이 나온다 (15분 단위 — 11-13 팀장님 지시로 30분에서 바꿈).
 * 날짜는 "YYYY-MM-DD" 글자로만 다룬다 (시차로 하루가 밀리는 일을 막는다).
 */
export const OT_START_MIN = 16 * 60 + 30;

export type OvertimeEntry = {
  id: string;
  user_id: string;
  work_date: string;
  minutes: number;
  end_time: string | null;
  task_id: string | null;
  task_title: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type OtSettings = {
  monthly_hours: number;
  start_date: string;
  slogan: string;
};

export const DEFAULT_OT_SETTINGS: OtSettings = {
  monthly_hours: 20,
  start_date: "2026-11-11",
  slogan: "시간·돈이 아니라 일이 중심이 되도록 노력합시다",
};

/** 잔업 때 한 일 — 직접 적은 글 (예전 방식으로 업무를 골라 넣은 기록은 그 업무 이름) */
export function otWork(e: { note: string | null; task_title: string | null }): string {
  return (e.note ?? "").trim() || (e.task_title ?? "").trim();
}

/** 잔업을 세는 단위(분) */
export const OT_STEP = 15;

/** 끝난 시각 선택지 — 16:45 ~ 24:00, 15분 간격 */
export const END_OPTIONS: { label: string; minutes: number; hour: number }[] = Array.from({ length: 30 }).map(
  (_, i) => {
    const total = OT_START_MIN + (i + 1) * OT_STEP;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return { label: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, minutes: (i + 1) * OT_STEP, hour: h };
  }
);

/** 22시 전까지는 바로 보이고, 그 뒤는 「더 늦게」로 접는다 */
export const LATE_FROM_MIN = 22 * 60 - OT_START_MIN;

/** 90 → "1.5", 75 → "1.25" (15분 단위라 소수 둘째 자리까지) */
export function hours(min: number): string {
  return String(Math.round((min / 60) * 100) / 100);
}

/** 월~금인가 */
export function isWorkday(key: string): boolean {
  const [y, m, d] = key.split("-").map(Number);
  const w = new Date(y, m - 1, d).getDay();
  return w >= 1 && w <= 5;
}

/** from~to 사이의 주중 날짜 (둘 다 포함) */
export function workdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) if (isWorkday(k)) out.push(k);
  return out;
}

/** 이 사람이 잔업 체크 대상인가 — 상무(실장)와 「대상 제외」한 사람은 뺀다 */
export function mustCheck(p: Profile | null | undefined): boolean {
  return !!p && p.status === "승인" && p.role !== "실장" && !p.ot_exempt;
}

/**
 * 본인이 직접 넣거나 고칠 수 있는 날인가 — 오늘까지, 그리고 (그 달 안 또는 7일 이내).
 * 서버 규칙(ot_editable)과 똑같이 맞춘다. 이 밖의 날짜는 팀장·상무만 넣을 수 있다.
 */
export function selfEditable(d: string): boolean {
  const today = todayKey();
  return d <= today && (d >= addDays(today, -7) || d.slice(0, 7) === today.slice(0, 7));
}

/**
 * 아직 체크하지 않은 날 — 시작일부터 어제까지의 주중 날짜 중 기록이 없는 날.
 * 너무 길어지지 않게 최근 10일만 본다 (오래 쉰 사람이 돌아왔을 때 수십 줄이 뜨지 않도록).
 * 본인이 넣을 수 있는 날만 돌려준다 (띠에 떴는데 눌러도 저장이 안 되는 일을 막는다).
 */
export function missingDays(entries: { work_date: string }[], startDate: string): string[] {
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const from = startDate > addDays(today, -14) ? startDate : addDays(today, -14);
  if (from > yesterday) return [];
  const have = new Set(entries.map((e) => e.work_date));
  return workdaysBetween(from, yesterday)
    .filter((d) => !have.has(d))
    // 본인이 못 넣는 날(달이 바뀌고 8일 넘게 지난 날)은 묻지 않는다 — 팀장 화면에 「미」로 남는다
    .filter(selfEditable)
    .slice(-10);
}

/** 지금이 잔업 시작(16:30) 이후인가 — 오늘 것을 물어도 되는 때 */
export function afterStartNow(): boolean {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes() >= OT_START_MIN;
}

export function sumMinutes(entries: { minutes: number }[]): number {
  return entries.reduce((n, e) => n + (e.minutes || 0), 0);
}

export function monthKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

/** 그 달의 날짜들 */
export function daysOfMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }).map((_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

export function shiftMonthKey(ym: string, by: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** 그 달을 주(월~금)로 묶는다 — 표의 주 합계 칸을 만들 때 쓴다 */
export function weeksOfMonth(ym: string): { monday: string; days: string[] }[] {
  const map = new Map<string, string[]>();
  for (const d of daysOfMonth(ym)) {
    if (!isWorkday(d)) continue;
    const mon = mondayOf(d);
    const arr = map.get(mon);
    if (arr) arr.push(d);
    else map.set(mon, [d]);
  }
  return [...map.entries()].map(([monday, days]) => ({ monday, days }));
}

/** "2026-11-11" → "11/11 (수)" */
export function shortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const w = "일월화수목금토"[new Date(y, m - 1, d).getDay()];
  return `${m}/${d} (${w})`;
}

/** 기준 시간 대비 색 — 80% 부터 노랑, 넘으면 빨강 */
export function limitTone(min: number, limitHours: number): "ok" | "warn" | "over" {
  const lim = limitHours * 60;
  if (lim <= 0) return "ok";
  if (min > lim) return "over";
  if (min >= lim * 0.8) return "warn";
  return "ok";
}
