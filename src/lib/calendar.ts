/**
 * 달력 계산.
 *
 * 날짜는 전부 "YYYY-MM-DD" 글자로만 다룬다.
 * Date 로 바꿔서 비교하면 시차 때문에 하루가 밀린다 (우리는 한국 시간만 쓴다).
 */

/** 오늘 (그 PC 시간 기준) */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-10-05T..." 또는 "2026-10-05" → "2026-10-05" (없으면 null) */
export function dayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 그 달 1일부터 말일까지 (달력 격자용으로 앞뒤 빈 칸까지 채운 6주 = 42칸) */
export function monthGrid(year: number, month1to12: number): string[] {
  const first = new Date(year, month1to12 - 1, 1);
  // 일요일부터 시작하는 격자
  const lead = first.getDay();
  const cells: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month1to12 - 1, 1 - lead + i);
    cells.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return cells;
}

/** 그 달의 날짜만 (1일 ~ 말일) — 타임라인 가로축 */
export function monthDays(year: number, month1to12: number): string[] {
  const last = new Date(year, month1to12, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) out.push(`${year}-${pad(month1to12)}-${pad(d)}`);
  return out;
}

/** 이 날짜가 그 달에 속하는지 */
export function inMonth(key: string, year: number, month1to12: number): boolean {
  return key.startsWith(`${year}-${pad(month1to12)}`);
}

/** 0=일 ... 6=토 */
export function weekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** 한 달 앞뒤로 이동 */
export function shiftMonth(year: number, month1to12: number, by: number) {
  const m0 = month1to12 - 1 + by;
  return { year: year + Math.floor(m0 / 12), month: ((m0 % 12) + 12) % 12 + 1 };
}

export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026-10-05" → "5" */
export function dayNumber(key: string): string {
  return String(Number(key.slice(8, 10)));
}

/** 공휴일은 모르므로 토·일만 구분한다 */
export function isWeekend(key: string): boolean {
  const w = weekday(key);
  return w === 0 || w === 6;
}

/** 요일 글자색 — 일요일 빨강, 토요일 파랑 (달력 머리글과 날짜를 같은 색으로) */
export function weekdayColor(key: string, muted = false): string {
  const w = weekday(key);
  if (w === 0) return muted ? "text-red-400" : "text-red-500";
  if (w === 6) return muted ? "text-blue-400" : "text-blue-500";
  return muted ? "text-gray-500" : "text-gray-600";
}
