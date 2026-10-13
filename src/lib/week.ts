/**
 * 주(週) 계산.
 *
 * 한 주는 월요일에 시작한다. 표에는 월~금만 적지만, 주말에 끝낸 일도
 * 그 주 실적으로 잡아야 하므로 실제 범위는 월~일로 둔다.
 *
 * 날짜는 "YYYY-MM-DD" 글자로만 비교한다. Date 로 바꿔 비교하면 시차 때문에
 * 하루가 밀린다 (달력 화면에서 같은 이유로 한 번 데였다).
 */

export type Week = {
  /** 월요일 */
  start: string;
  /** 금요일 — 표에 적는 끝 */
  friday: string;
  /** 일요일 — 실제 집계 끝 */
  end: string;
  /** "10/12 월 ~ 10/16 금" */
  label: string;
  /** "2026년 10월 3주차" */
  title: string;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function key(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parse(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 그 날이 속한 주의 월요일 */
export function mondayOf(dayKey: string): string {
  const d = parse(dayKey);
  // getDay(): 0=일 … 6=토. 일요일은 "지난 월요일"로 당긴다.
  const back = d.getDay() === 0 ? 6 : d.getDay() - 1;
  d.setDate(d.getDate() - back);
  return key(d);
}

export function addDays(dayKey: string, n: number): string {
  const d = parse(dayKey);
  d.setDate(d.getDate() + n);
  return key(d);
}

/** 그 달의 몇 번째 주인지 (1일이 든 주가 1주차) */
function weekOfMonth(mondayKey: string): { year: number; month: number; nth: number } {
  // 목요일이 속한 달을 그 주의 달로 본다 (월말·월초에 걸친 주 때문)
  const thu = parse(addDays(mondayKey, 3));
  const year = thu.getFullYear();
  const month = thu.getMonth() + 1;
  const firstMonday = mondayOf(`${year}-${pad(month)}-01`);
  const diff = Math.round(
    (parse(mondayKey).getTime() - parse(firstMonday).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  // 1일이 든 주를 1주차로 센다
  const firstHasDay1 = parse(firstMonday).getMonth() + 1 === month || true;
  return { year, month, nth: diff + (firstHasDay1 ? 1 : 0) };
}

export function weekFrom(dayKey: string): Week {
  const start = mondayOf(dayKey);
  const friday = addDays(start, 4);
  const end = addDays(start, 6);
  const { year, month, nth } = weekOfMonth(start);
  return {
    start,
    friday,
    end,
    label: `${short(start)} 월 ~ ${short(friday)} 금`,
    title: `${year}년 ${month}월 ${nth}주차`,
  };
}

function short(k: string): string {
  return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
}

export function thisWeek(): Week {
  const now = new Date();
  return weekFrom(key(now));
}

export function shiftWeek(w: Week, byWeeks: number): Week {
  return weekFrom(addDays(w.start, byWeeks * 7));
}

/** "2026-10-14T09:00:00Z" 또는 "2026-10-14" → "2026-10-14" */
export function dayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 그 날짜가 주 안에 드는가 */
export function inWeek(value: string | null | undefined, w: Week): boolean {
  const d = dayOf(value);
  return !!d && d >= w.start && d <= w.end;
}
