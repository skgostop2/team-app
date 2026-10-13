import type { Profile, TaskUpdate, TaskWithEffectiveStatus } from "@/lib/types";
import { byDisplayOrder } from "@/lib/roles";
import { dayOf, inWeek, type Week } from "@/lib/week";

/**
 * 금주 계획 대비 실적을 만든다.
 *
 * 원칙: 계획을 다시 적게 하지 않는다.
 * 이미 업무관리에 들어 있는 것에서 "이번 주에 걸려 있는 일"을 뽑아낸다.
 * 사람이 추가로 적는 것은 없다 — 실적은 평소 쓰는 진행기록을 그대로 쓴다.
 */

/** 이 업무가 이번 주에 걸려 있는가 */
export function isThisWeek(t: TaskWithEffectiveStatus, w: Week): boolean {
  // 이번 주에 끝낸 것
  if (inWeek(t.completed_at, w)) return true;

  const due = dayOf(t.due_date);
  const start = dayOf(t.start_date);
  const done = t.effective_status === "완료";

  // 이번 주가 기한인 것
  if (due && due >= w.start && due <= w.end) return true;

  // 기한이 지났는데 아직 안 끝난 것 — 이월해서 이번 주에도 걸려 있다
  if (due && due < w.start && !done) return true;

  // 이미 시작했고 아직 안 끝났고, 기한이 아직 안 지난 것
  if (start && start <= w.end && !done && (!due || due >= w.start)) return true;

  return false;
}

/**
 * 다음 주에 걸릴 일.
 *
 * 이번 주 기한인데 아직 안 끝난 것은 여기 넣지 않는다 — 금주 칸에 이미 있어서
 * 같은 업무가 위아래로 두 번 찍힌다. 기한이 이미 지난 것(진짜 밀린 것)만 넘긴다.
 */
export function isNextWeek(
  t: TaskWithEffectiveStatus,
  week: Week,
  next: Week
): boolean {
  if (t.effective_status === "완료") return false;
  const due = dayOf(t.due_date);
  if (!due) return false;
  // 다음 주가 기한인 것
  if (due >= next.start && due <= next.end) return true;
  // 기한이 이번 주보다 전인데 아직 안 끝난 것 — 계속 밀리고 있다
  if (due < week.start) return true;
  return false;
}

export type WeeklyRow = {
  task: TaskWithEffectiveStatus;
  /** 이번 주에 쓴 진행기록 */
  notes: TaskUpdate[];
  /** 기한을 넘겼는가 */
  overdue: boolean;
  /** 이번 주에 끝냈는가 */
  doneThisWeek: boolean;
  /** 지난 주에서 넘어온 것인가 */
  carried: boolean;
};

export type WeeklyPerson = {
  profile: Profile;
  groupName: string | null;
  rows: WeeklyRow[];
  next: TaskWithEffectiveStatus[];
  done: number;
  running: number;
  late: number;
};

/** 한 사람이 그 업무에 걸려 있는가 (담당 또는 참여) */
function isOn(t: TaskWithEffectiveStatus, id: string): boolean {
  return t.assignee_id === id || (t.deputy_ids ?? []).includes(id);
}

export function buildWeekly({
  profiles,
  tasks,
  updates,
  week,
  next,
  groupNameOf,
}: {
  profiles: Profile[];
  tasks: TaskWithEffectiveStatus[];
  updates: TaskUpdate[];
  week: Week;
  next: Week;
  groupNameOf: (groupId: string | null) => string | null;
}): WeeklyPerson[] {
  const weekTasks = tasks.filter((t) => isThisWeek(t, week));
  const nextTasks = tasks.filter((t) => isNextWeek(t, week, next));

  const notesByTask = new Map<string, TaskUpdate[]>();
  for (const u of updates) {
    if (!inWeek(u.created_at, week)) continue;
    const arr = notesByTask.get(u.task_id);
    if (arr) arr.push(u);
    else notesByTask.set(u.task_id, [u]);
  }

  const people = profiles
    .filter((p) => p.status === "승인" || p.status === "가입대기")
    .map((p): WeeklyPerson => {
      const mine = weekTasks.filter((t) => isOn(t, p.id));

      const rows = mine.map((t): WeeklyRow => {
        const due = dayOf(t.due_date);
        return {
          task: t,
          notes: (notesByTask.get(t.id) ?? []).sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          ),
          overdue: t.effective_status === "지연",
          doneThisWeek: inWeek(t.completed_at, week),
          carried: !!due && due < week.start && t.effective_status !== "완료",
        };
      });

      // 막힌 것이 위로 — 회의에서 먼저 짚는 순서
      rows.sort((a, b) => {
        const rank = (r: WeeklyRow) => (r.overdue ? 0 : r.task.effective_status === "완료" ? 2 : 1);
        const d = rank(a) - rank(b);
        if (d !== 0) return d;
        return (dayOf(a.task.due_date) ?? "9999").localeCompare(dayOf(b.task.due_date) ?? "9999");
      });

      return {
        profile: p,
        groupName: groupNameOf(p.group_id),
        rows,
        next: nextTasks.filter((t) => isOn(t, p.id)),
        done: rows.filter((r) => r.task.effective_status === "완료").length,
        running: rows.filter(
          (r) => r.task.effective_status === "진행중" || r.task.effective_status === "대기"
        ).length,
        late: rows.filter((r) => r.overdue).length,
      };
    })
    // 이번 주에 걸린 일도, 다음 주 일도 없는 사람은 표에서 뺀다
    .filter((x) => x.rows.length > 0 || x.next.length > 0);

  // 그룹별로 묶고, 그룹 안에서는 그룹장이 먼저
  return people.sort((a, b) => {
    const ga = a.groupName ?? "￿";
    const gb = b.groupName ?? "￿";
    if (ga !== gb) return ga.localeCompare(gb);
    return byDisplayOrder(a.profile, b.profile);
  });
}

/** 전체 합계 */
export function totals(people: WeeklyPerson[]) {
  return people.reduce(
    (acc, p) => ({
      done: acc.done + p.done,
      running: acc.running + p.running,
      late: acc.late + p.late,
    }),
    { done: 0, running: 0, late: 0 }
  );
}
