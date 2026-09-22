import { bareName } from "./importTasks";

/**
 * 빠른 등록 — 한 줄에 한 건씩 적은 글을 업무로 바꾼다.
 *
 *   청소대차 진행보고 - 안윤환
 *   에어드레인 용량 조사 보고 - 안윤환
 *   발루프센서 배선 확인 체크시트 추가 보고 - 안윤환
 *
 * 이름은 팀원 명단에서 찾아 붙인다. 오타가 나도 비슷한 이름을 찾되,
 * 확신이 없으면 제멋대로 정하지 않고 "확인 필요"로 표시한다.
 * 업무는 사람에게 붙는 것이라 잘못 붙은 한 건이 오래 간다.
 */

export type NameMatch = {
  /** 글에 적힌 이름 그대로 */
  token: string;
  id: string | null;
  name: string | null;
  /** exact = 그대로 맞음, near = 비슷한 이름 추정, ambiguous = 후보가 여럿, none = 못 찾음 */
  kind: "exact" | "near" | "ambiguous" | "none";
  /** ambiguous 일 때 후보들 */
  candidates: { id: string; name: string }[];
};

export type QuickRow = {
  /** 원래 줄 */
  raw: string;
  title: string;
  /** 담당자 (첫 번째 이름) */
  assigneeId: string | null;
  /** 참여자 (두 번째 이후 이름) */
  deputyIds: string[];
  matches: NameMatch[];
  warnings: string[];
};

export type Member = { id: string; name: string };

/** 글자 단위 편집거리. 한글 이름은 짧아서 이 정도면 충분하다. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** 이름처럼 생겼는지 — 한글 2~4자 (직급을 떼고 본다) */
export function looksLikeName(raw: string): boolean {
  const s = bareName(raw);
  return /^[가-힣]{2,4}$/.test(s);
}

/**
 * 이름 하나를 팀원 명단에서 찾는다.
 *
 * 1) 그대로 맞으면 exact
 * 2) 성이 같고 편집거리 1~2 인 사람이 딱 하나면 near (확인 표시가 붙는다)
 * 3) 그런 사람이 둘 이상이면 ambiguous — 고르게 둔다
 */
export function matchName(token: string, members: Member[]): NameMatch {
  const t = bareName(token);
  const base: NameMatch = { token: token.trim(), id: null, name: null, kind: "none", candidates: [] };
  if (!t) return base;

  const exact = members.find((m) => bareName(m.name) === t);
  if (exact) return { ...base, id: exact.id, name: exact.name, kind: "exact" };

  // 적힌 이름이 명단 이름으로 시작하거나 그 반대인 경우 (예: "안윤환님상", "안윤")
  const prefix = members.filter((m) => {
    const n = bareName(m.name);
    return n.length >= 2 && (t.startsWith(n) || n.startsWith(t));
  });
  if (prefix.length === 1) {
    return { ...base, id: prefix[0].id, name: prefix[0].name, kind: "near" };
  }

  const scored = members
    .map((m) => ({ m, d: editDistance(t, bareName(m.name)) }))
    .filter((x) => x.d <= 2 && bareName(x.m.name)[0] === t[0])
    .sort((a, b) => a.d - b.d);

  if (scored.length === 0) {
    return prefix.length > 1
      ? { ...base, kind: "ambiguous", candidates: prefix.map((m) => ({ id: m.id, name: m.name })) }
      : base;
  }

  const best = scored[0];
  const tied = scored.filter((x) => x.d === best.d);
  if (tied.length > 1) {
    return {
      ...base,
      kind: "ambiguous",
      candidates: tied.map((x) => ({ id: x.m.id, name: x.m.name })),
    };
  }
  return { ...base, id: best.m.id, name: best.m.name, kind: "near" };
}

const SEP = /\s*[-–—~:|]\s*|\s{2,}/;

/**
 * 한 줄을 업무명과 이름들로 가른다.
 *
 * 뒤쪽 토막이 이름처럼 생겼을 때만 이름으로 본다.
 * "NX5-2 금형 수정" 처럼 업무명 안에 붙임표가 있어도 통째로 업무명이 되게 하기 위함이다.
 */
export function splitTitleAndNames(line: string): { title: string; names: string[] } {
  const raw = line.trim();

  // (홍길동) / 담당 홍길동 / 담당: 홍길동
  const paren = raw.match(/^(.*?)[(（]\s*([^)）]+)\s*[)）]\s*$/);
  const damdang = raw.match(/^(.*?)\s*담당\s*[:：]?\s*(.+)$/);

  const tryTail = (head: string, tail: string): { title: string; names: string[] } | null => {
    // 쉼표·"및"·"와/과" 로 먼저 가른다.
    // 띄어쓰기로 먼저 가르면 "강신준 매니저"의 직급이 이름으로 잘못 떨어진다.
    const pieces = tail
      .split(/[,،、/&]|\s+및\s+|\s+와\s+|\s+과\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const names: string[] = [];
    for (const piece of pieces) {
      if (looksLikeName(piece)) {
        names.push(piece);
        continue;
      }
      // "강신준 이준호" 처럼 띄어쓰기로만 나열한 경우
      const subs = piece.split(/\s+/).filter(Boolean);
      if (subs.length > 1 && subs.every(looksLikeName)) {
        names.push(...subs);
        continue;
      }
      return null;
    }
    if (names.length === 0 || names.length > 3) return null;
    if (!head.trim()) return null;
    return { title: head.trim(), names };
  };

  if (paren) {
    const r = tryTail(paren[1], paren[2]);
    if (r) return r;
  }
  if (damdang) {
    const r = tryTail(damdang[1], damdang[2]);
    if (r) return r;
  }

  // 마지막 구분자 뒤를 이름 후보로 본다
  const parts = raw.split(SEP);
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1];
    const head = raw.slice(0, raw.length - tail.length).replace(/\s*[-–—~:|]\s*$/, "");
    const r = tryTail(head, tail);
    if (r) return r;
  }

  return { title: raw, names: [] };
}

/** 붙여넣은 글 전체를 업무 줄들로 바꾼다 */
export function parseQuickLines(text: string, members: Member[]): QuickRow[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    // 번호 매김("1.", "1)", "-", "•")은 떼어낸다
    .map((l) => l.replace(/^\s*(\d{1,2}\s*[.)]|[-•*·])\s*/, "").trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const { title, names } = splitTitleAndNames(line);
      const matches = names.map((n) => matchName(n, members));
      const warnings: string[] = [];

      if (names.length === 0) warnings.push("이름을 못 찾았습니다 — 담당자를 골라주세요");
      for (const m of matches) {
        if (m.kind === "near") warnings.push(`"${m.token}" → ${m.name} 으로 봤습니다 (확인)`);
        if (m.kind === "ambiguous")
          warnings.push(
            `"${m.token}" 는 ${m.candidates.map((c) => c.name).join(", ")} 중 누구인지 모르겠습니다`
          );
        if (m.kind === "none") warnings.push(`"${m.token}" 는 명단에 없습니다`);
      }
      if (title.length < 2) warnings.push("업무명이 너무 짧습니다");

      const ids = matches.map((m) => m.id);
      return {
        raw: line,
        title,
        assigneeId: ids[0] ?? null,
        deputyIds: ids.slice(1).filter((x): x is string => !!x),
        matches,
        warnings,
      };
    });
}

/** 등록용 한 건으로 만든다 */
export function toQuickInsert(
  row: QuickRow,
  createdBy: string,
  opts: { instructor?: string | null; dueDate?: string | null } = {}
) {
  return {
    title: row.title,
    assignee_id: row.assigneeId,
    deputy_ids: row.deputyIds,
    created_by: createdBy,
    instructor: opts.instructor ?? null,
    due_date: opts.dueDate ?? null,
    progress: 0,
    status: "대기",
  };
}
