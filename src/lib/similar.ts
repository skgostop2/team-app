import { editDistance } from "./quickAdd";

/**
 * 비슷한 업무 찾기.
 *
 * 같은 일을 두 번 지시하거나, 두 사람에게 같은 일이 가는 것을 막기 위한 것이다.
 * 다만 **막지는 않는다** — 1차/2차, 라인만 다른 같은 이름의 업무가 실제로 있다.
 * 알려만 주고 판단은 사람이 한다.
 */

/** 띄어쓰기·기호·조사 차이를 지워서 견준다 */
export function normalizeTitle(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\s()（）[\]{}·,./\-_~!?'"“”‘’:;]/g, "")
    .replace(/(보고|진행|관련|건$)/g, "");
}

/** 0~1. 1이면 같은 글, 0이면 완전히 다르다 */
export function similarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const longer = Math.max(x.length, y.length);
  return 1 - editDistance(x, y) / longer;
}

export type SimilarTask = {
  id: string;
  title: string;
  assignee_id: string | null;
  due_date: string | null;
  effective_status: string | null;
  completed_at: string | null;
};

/** 이 정도 닮았으면 사람에게 보여준다 */
export const SIMILAR_MIN = 0.62;

/** 끝난 지 오래된 업무는 견주지 않는다 (예전에 한 번 한 일까지 다 걸리면 시끄럽다) */
const DONE_WITHIN_DAYS = 90;

function recentEnough(t: SimilarTask): boolean {
  if (!t.completed_at) return true;
  const days = (Date.now() - new Date(t.completed_at).getTime()) / 86_400_000;
  return days <= DONE_WITHIN_DAYS;
}

/** 새로 올리려는 제목과 닮은 기존 업무들 (닮은 순서) */
export function findSimilar(
  title: string,
  pool: SimilarTask[],
  limit = 2
): { task: SimilarTask; score: number }[] {
  if (!title || title.trim().length < 3) return [];
  return pool
    .filter(recentEnough)
    .map((task) => ({ task, score: similarity(title, task.title) }))
    .filter((x) => x.score >= SIMILAR_MIN)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** 붙여넣은 글 안에서 서로 겹치는 줄 찾기 — 같은 지시문에 같은 줄이 두 번 들어가는 일이 잦다 */
export function findDuplicatesWithin(titles: string[]): Map<number, number> {
  const out = new Map<number, number>();
  for (let i = 1; i < titles.length; i++) {
    for (let j = 0; j < i; j++) {
      if (similarity(titles[i], titles[j]) >= SIMILAR_MIN) {
        out.set(i, j);
        break;
      }
    }
  }
  return out;
}
