/**
 * 세부 항목.
 *
 * 한 업무에 할 일이 넷인데 진행률이 하나뿐이면, 적는 사람은 어림으로 60%라 쓰고
 * 보는 사람은 그 60%가 어디까지인지 모른다.
 * 항목을 나눠 체크하면 "넷 중 둘"이라는 같은 뜻이 된다.
 *
 * 이중 입력은 만들지 않는다 — 이미 상세내용에 1) 2) 3) 으로 적고 있으므로
 * 그 줄을 그대로 항목으로 뽑아 쓴다.
 */

export type TaskItem = {
  id: string;
  task_id: string;
  idx: number;
  text: string;
  done: boolean;
  done_at: string | null;
  done_by: string | null;
};

/** 항목 수와 끝낸 수 */
export type ItemCount = { done: number; total: number };

/** 줄 앞에 붙은 번호·기호를 뗀다 ("1) ", "- ", "· ", "② ") */
function strip(line: string): string {
  return line
    .replace(/^[\s ]*[-•·*▪◦]\s*/, "")
    .replace(/^[\s ]*\(?\d{1,2}[).．.]\s*/, "")
    .replace(/^[\s ]*[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "")
    .replace(/^[\s ]*[☐☑✓v]\s+/i, "")
    .trim();
}

/**
 * 상세내용에서 항목을 뽑는다.
 *
 * 들여쓴 하위 줄("  - 초음파융착기 …")은 윗 항목에 딸린 설명이라
 * 윗 항목에 이어 붙인다 — 항목이 지나치게 잘게 쪼개지면 체크가 일이 된다.
 */
export function itemsFromText(text: string): string[] {
  const out: string[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indented = /^[\s ]{2,}/.test(raw) || /^[\s ]*[-•·]/.test(raw);
    const body = strip(raw);
    if (!body) continue;

    const numbered = /^[\s ]*\(?\d{1,2}[).．.]/.test(raw) || /^[\s ]*[①②③④⑤⑥⑦⑧⑨⑩]/.test(raw);

    if (!numbered && indented && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]} / ${body}`;
      continue;
    }
    out.push(body);
  }
  // 너무 긴 항목은 표에서 읽기 어려우니 적당히 자른다
  return out.map((s) => (s.length > 120 ? s.slice(0, 118) + "…" : s)).slice(0, 30);
}

/** 체크 수로 진행률을 낸다 (서버 트리거와 같은 계산) */
export function percentOf(c: ItemCount): number {
  if (!c.total) return 0;
  return Math.round((c.done * 100) / c.total);
}
