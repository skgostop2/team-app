/**
 * 날짜 오타 걸러내기.
 *
 * 일정이 "무리한가"는 기계가 판단할 수 없다 — 납기가 급하면 한 주에 다섯 건도
 * 정상이고, 특근하면 토요일 마감도 정상이다. 그런 것까지 경고로 띄우면
 * 매번 뜨는 경고가 되고, 사람은 경고를 읽지 않게 된다.
 *
 * 그래서 여기서는 **누가 봐도 잘못 적은 것**만 잡는다.
 * 연도를 2025로 친 것, 완료일이 착수일보다 빠른 것 — 거짓 경보가 날 일이 없다.
 */

export type DateVerdict = {
  /** 막아야 하는 것 (저장 불가) */
  block?: string;
  /** 묻기만 하는 것 (저장은 됨) */
  warn?: string;
} | null;

/** 지난 날짜를 이만큼 넘게 적으면 연도를 잘못 친 것으로 본다 */
const PAST_DAYS = 30;
/** 앞으로 이만큼 넘게 적으면 연도를 잘못 친 것으로 본다 */
const FUTURE_DAYS = 365;
/** 표에서 ⚠ 를 띄울 기준 (일정대비가 이만큼 벌어지면 날짜를 의심한다) */
export const ODD_DIFF_DAYS = 100;

function parse(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** 오늘로부터 며칠 뒤인가 (음수면 지난 날짜) */
export function daysFromToday(key: string): number | null {
  const d = parse(key);
  if (!d) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function yearHint(key: string): string {
  const y = Number(key.slice(0, 4));
  const thisYear = new Date().getFullYear();
  if (!y || y === thisYear) return "";
  return ` (${y}년 → ${thisYear}년 아닙니까?)`;
}

/** 완료계획일 검사 — 착수일보다 빠르면 막고, 너무 멀면 묻는다 */
export function checkDue(due: string, start?: string | null): DateVerdict {
  if (!due) return null;
  const n = daysFromToday(due);
  if (n === null) return null;

  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && due < start) {
    return { block: `완료계획일이 진행일정(${start})보다 빠릅니다. 날짜를 다시 보세요.` };
  }
  if (n < -PAST_DAYS) {
    return { warn: `오늘보다 ${-n}일 전입니다. 연도를 확인하세요${yearHint(due)}` };
  }
  if (n > FUTURE_DAYS) {
    return { warn: `오늘로부터 ${n}일 뒤입니다. 연도를 확인하세요${yearHint(due)}` };
  }
  return null;
}

/** 진행일정(착수일) 검사 — 과거는 정상이다. 완료계획일을 넘기거나 너무 먼 것만 본다 */
export function checkStart(start: string, due?: string | null): DateVerdict {
  if (!start) return null;
  const n = daysFromToday(start);
  if (n === null) return null;

  if (due && /^\d{4}-\d{2}-\d{2}$/.test(due) && start > due) {
    return { block: `진행일정이 완료계획일(${due})보다 늦습니다. 날짜를 다시 보세요.` };
  }
  if (n > FUTURE_DAYS) {
    return { warn: `오늘로부터 ${n}일 뒤입니다. 연도를 확인하세요${yearHint(start)}` };
  }
  if (n < -FUTURE_DAYS * 2) {
    return { warn: `오늘보다 ${-n}일 전입니다. 연도를 확인하세요${yearHint(start)}` };
  }
  return null;
}

/** 완료일 검사 — 끝난 날이 미래일 수는 없다 */
export function checkDone(done: string): DateVerdict {
  if (!done) return null;
  const n = daysFromToday(done);
  if (n === null) return null;
  if (n > 0) return { warn: `아직 오지 않은 날짜입니다${yearHint(done)}` };
  if (n < -FUTURE_DAYS) {
    return { warn: `오늘보다 ${-n}일 전입니다. 연도를 확인하세요${yearHint(done)}` };
  }
  return null;
}

/**
 * 날짜 칸이 허용하는 범위.
 *
 * 브라우저의 날짜 칸은 연도를 네 자리로 막아주지 않는다 — 타이핑하면
 * 202026 처럼 여섯 자리까지 들어간다. 그래서 칸 자체에 범위를 걸고,
 * 그래도 넘어온 값은 아래 fixYear 로 네 자리로 되돌린다.
 */
export const DATE_MIN = "2000-01-01";
export const DATE_MAX = "2100-12-31";

/** 연도가 네 자리를 넘으면 뒤 네 자리만 남긴다 (202026 → 2026) */
export function fixYear(value: string): string {
  const m = (value ?? "").match(/^(\d{5,})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  return `${m[1].slice(-4)}-${m[2]}-${m[3]}`;
}
