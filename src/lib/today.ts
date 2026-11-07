import type { QuestionCount, TaskWithEffectiveStatus } from "./types";
import { todayKey } from "./calendar";

/**
 * "오늘 뭐부터 봐야 하나"를 숫자 몇 개로 만든다.
 *
 * 팀원 화면 맨 위 「오늘 한 줄」과 팀장 대시보드 「오늘 상황판」이 같은 계산을 쓴다.
 * 숫자를 누르면 표가 그것만 추려지므로, 여기 규칙이 곧 필터 규칙이다.
 */
export type QuickKey =
  | "today" // 오늘 마감
  | "delayed" // 지연
  | "new" // 아직 확인 안 한 지시
  | "stalled" // 7일 넘게 안 움직임
  | "questions" // 답을 기다리는 질문
  | "urgent" // 긴급
  | "recent" // 어제부터 기록이 올라온 업무
  | "doneRecent"; // 어제부터 완료된 업무

/** 어제 0시 (로컬) — "어제부터 바뀐 것"의 기준 */
export function yesterdayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  return d;
}

export function quickMatch(
  key: QuickKey,
  t: TaskWithEffectiveStatus,
  questions?: Map<string, QuestionCount>
): boolean {
  const open = t.effective_status !== "완료";
  switch (key) {
    case "today":
      return open && t.due_date === todayKey();
    case "delayed":
      return t.effective_status === "지연";
    case "new":
      return open && t.is_new;
    case "stalled":
      return open && !!t.stalled;
    case "questions":
      return (questions?.get(t.id)?.open ?? 0) > 0;
    case "urgent":
      return open && !!t.urgent;
    case "recent":
      return !!t.last_update_at && new Date(t.last_update_at) >= yesterdayStart();
    case "doneRecent":
      return !!t.completed_at && new Date(t.completed_at) >= yesterdayStart();
  }
}

export function countQuick(
  tasks: TaskWithEffectiveStatus[],
  questions?: Map<string, QuestionCount>
): Record<QuickKey, number> {
  const keys: QuickKey[] = [
    "today",
    "delayed",
    "new",
    "stalled",
    "questions",
    "urgent",
    "recent",
    "doneRecent",
  ];
  const out = {} as Record<QuickKey, number>;
  for (const k of keys) out[k] = tasks.filter((t) => quickMatch(k, t, questions)).length;
  return out;
}

/** 미확인 지시 중 가장 오래된 것이 며칠째인지 (없으면 0) */
export function oldestUnconfirmedDays(tasks: TaskWithEffectiveStatus[]): number {
  let max = 0;
  const now = Date.now();
  for (const t of tasks) {
    if (!t.is_new || t.effective_status === "완료") continue;
    const d = Math.floor((now - new Date(t.created_at).getTime()) / 86400000);
    if (d > max) max = d;
  }
  return max;
}
