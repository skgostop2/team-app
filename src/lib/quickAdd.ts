import { bareName, parseDate } from "./importTasks";

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
  /** 글에서 읽어낸 기한 (없으면 null) */
  dueDate: string | null;
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

/**
 * 붙여넣은 글을 건별로 가른다.
 *
 * 줄바꿈이 먼저다. 다만 카톡·메일에서 긁어오면 한 줄에
 * "1. ... 2. ... 3. ..." 처럼 다 붙어 오는 경우가 있어 번호도 경계로 본다.
 */
export function splitItems(text: string): string[] {
  const out: string[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    // 한 줄 안에 번호가 둘 이상이면 번호마다 끊는다
    const marks = [...t.matchAll(/(?:^|\s)(\d{1,2})\s*[.)]\s+/g)];
    if (marks.length >= 2) {
      for (let i = 0; i < marks.length; i++) {
        const start = marks[i].index! + marks[i][0].length;
        const end = i + 1 < marks.length ? marks[i + 1].index! : t.length;
        const piece = t.slice(start, end).trim();
        if (piece) out.push(piece);
      }
      continue;
    }
    out.push(t);
  }
  return out.map((l) => l.replace(/^\s*(\d{1,2}\s*[.)]|[-•*·])\s*/, "").trim()).filter(Boolean);
}

/** 글 어디에 있든 기한처럼 생긴 날짜를 찾는다. matched = 글에서 잘라낼 토막 */
export function findDue(text: string): { date: string; matched: string } | null {
  const patterns = [
    /기한\s*[:：]?\s*([0-9]{1,4}[-./월][0-9]{1,2}[일]?(?:[-./][0-9]{1,2})?)/,
    /([0-9]{1,4}[-./][0-9]{1,2}(?:[-./][0-9]{1,2})?)\s*까지/,
    /([0-9]{1,2}\s*월\s*[0-9]{1,2}\s*일?)\s*까지/,
    /(?:^|\s)([0-9]{1,2}\/[0-9]{1,2})(?=\s|$)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const d = parseDate(m[1].replace(/\s+/g, ""));
      if (d) return { date: d, matched: m[0] };
    }
  }
  return null;
}

/** 날짜만 필요할 때 */
export function findDueDate(text: string): string | null {
  return findDue(text)?.date ?? null;
}

/** 사람 이름이 아닌 게 뻔한 말들 — 업무지시 글에 늘 섞여 나온다 */
const NOT_NAMES = [
  "기한", "완료", "보고", "참여", "담당", "관련", "이하", "유관", "확인", "회신",
  "제출", "필히", "협조", "진행", "예정", "까지", "부터", "이상", "이내",
];
/** "품질팀", "기계실" 처럼 조직 이름 */
const ORG_TAIL = /(팀|실|부|과|반|처|소|그룹|센터)$/;

/**
 * "담당 이준호 책임, 기한 9/17까지 보고 완료 필" 같은 토막에서 이름만 골라낸다.
 *
 * 첫 토막은 이름 자리라 명단에 없어도 이름으로 본다 (그래야 "명단에 없습니다"라고
 * 알려줄 수 있다). 두 번째부터는 명단에 있는 사람만 받는다 — 안 그러면
 * "기한", "품질팀" 같은 말이 사람으로 둔갑한다.
 */
function namesFromClause(clause: string, members: Member[]): string[] {
  const usable = (t: string): boolean => {
    const b = bareName(t);
    if (!looksLikeName(t)) return false;
    if (NOT_NAMES.includes(b)) return false;
    if (ORG_TAIL.test(b) && !members.some((m) => bareName(m.name) === b)) return false;
    return true;
  };

  const names: string[] = [];
  const pieces = clause.split(/[,、/&]|\s+및\s+|\s+와\s+|\s+과\s+/);
  for (let i = 0; i < pieces.length; i++) {
    const t = pieces[i].trim();
    if (!t) continue;
    // "이준호 책임 보고" 처럼 뒤에 말이 더 붙으면 앞쪽만 본다
    const cand = usable(t) ? t : t.split(/\s+/)[0];
    if (!usable(cand)) continue;

    const known = matchName(cand, members).kind !== "none";
    if (names.length === 0 || known) names.push(cand);
  }
  return names.slice(0, 3);
}

/**
 * 한 건을 업무명·이름·기한으로 가른다.
 *
 * 실제로 오는 글이 한 가지 모양이 아니다. 아래 순서로 본다.
 *   1) 끝의 괄호 안 — "(담당 이준호 책임, 기한 9/17까지 보고 완료 필)"
 *   2) "담당" 이라는 말 뒤
 *   3) 끝의 구분자 뒤 — "청소대차 진행보고 - 안윤환"
 *   4) 그래도 없으면 글 안에 명단 이름이 그대로 들어있는지
 */
export function parseItem(
  raw: string,
  members: Member[]
): { title: string; names: string[]; dueDate: string | null } {
  const line = raw.trim();
  const due = findDue(line);
  const dueDate = due?.date ?? null;
  /** 기한으로 읽은 토막("9/25까지", "기한 9/17")은 업무명에서 뺀다 */
  const noDate = (t: string) => (due ? t.replace(due.matched, " ") : t);

  // 0) "안윤환: 청소대차 진행보고" — 이름이 앞에 오는 경우
  const lead = line.match(/^([가-힣]{2,4})\s*(?:책임|매니저|팀장|실장|사원|주임|대리|과장|차장|부장|님)?\s*[:：]\s*(.+)$/);
  if (lead && matchName(lead[1], members).kind === "exact" && lead[2].trim().length >= 2) {
    return { title: cleanTitle(noDate(lead[2])), names: [lead[1]], dueDate };
  }

  // 1) 끝의 괄호
  const paren = line.match(/^(.*?)\s*[(（]\s*([^)）]*)\s*[)）]\s*$/);
  if (paren && paren[1].trim()) {
    const inner = paren[2];
    const damdang = inner.match(/담당[자]?\s*[:：]?\s*(.+)$/);
    const names = namesFromClause(damdang ? damdang[1] : inner, members);
    if (names.length > 0) {
      return { title: cleanTitle(noDate(paren[1])), names, dueDate };
    }
  }

  // 2) "담당" 뒤
  const d = line.match(/^(.*?)[\s(（,]*담당[자]?\s*[:：]?\s*(.+)$/);
  if (d && d[1].trim()) {
    const names = namesFromClause(d[2], members);
    if (names.length > 0) return { title: cleanTitle(noDate(d[1])), names, dueDate };
  }

  // 3) 끝의 구분자 뒤
  const byTail = splitTitleAndNames(line);
  if (byTail.names.length > 0) {
    return { title: cleanTitle(noDate(byTail.title)), names: byTail.names, dueDate };
  }

  // 4) 글 안에 명단 이름이 그대로 들어 있는 경우 (정확히 맞을 때만)
  const found: string[] = [];
  for (const m of members) {
    const n = bareName(m.name);
    if (n.length >= 2 && line.includes(n)) found.push(n);
  }
  if (found.length > 0) {
    let title = noDate(line);
    for (const n of found) title = title.replace(new RegExp(`[\\s,(（-]*${n}[\\s)）,]*`, "g"), " ");
    return { title: cleanTitle(title) || line, names: found.slice(0, 3), dueDate };
  }

  return { title: cleanTitle(noDate(line)), names: [], dueDate };
}

/** 업무명 앞뒤에 남은 직급·조사·구분자를 턴다 */
function cleanTitle(s: string): string {
  return s
    // 이름을 뗀 자리에 남는 "매니저가", "책임이", "님께서" 같은 꼬리
    .replace(
      /^\s*(책임|매니저|팀장|실장|사원|주임|대리|과장|차장|부장|공장장|대표|이사|상무|전무|기사|반장|조장|님)\s*(이|가|은|는|께서|에게|한테)?\s*/,
      ""
    )
    // 이름을 뗀 자리에 남는 조사 ("한테", "에게", "은/는/이/가")
    .replace(/^\s*(한테|에게|께서|께|은|는|이|가|도)\s+/, "")
    // "~시켰고", "~시킴" 같은 맺음말
    .replace(/\s*(시켰고|시켰음|시킴|시켰습니다|하도록|할것|할 것)\s*$/, "")
    .replace(/[\s,]*[(（]\s*[)）]/g, "")
    .replace(/[\s]*[-–—~:|,(（]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** 이 줄이 "사람 이름만" 적힌 머리글인지 (예: "안윤환" 또는 "안윤환 매니저") */
export function isPersonHeader(line: string, members: Member[]): Member | null {
  const t = line.replace(/[:：]\s*$/, "").trim();
  if (!looksLikeName(t)) return null;
  const m = matchName(t, members);
  return m.id ? { id: m.id, name: m.name! } : null;
}

/**
 * 붙여넣은 글 전체를 업무 줄들로 바꾼다.
 *
 * 자유롭게 적은 글도 읽는다. 이름만 적힌 줄이 나오면 그 아래
 * 이름 없는 줄들은 그 사람 것으로 본다 —
 *
 *   안윤환
 *   - 청소대차 진행보고
 *   - 에어드레인 용량 조사      → 둘 다 안윤환
 */
export function parseQuickLines(text: string, members: Member[]): QuickRow[] {
  const out: QuickRow[] = [];
  let carried: Member | null = null;

  for (const line of splitItems(text)) {
    // 이름만 적힌 줄 — 업무가 아니라 아래 줄들의 담당자다
    const header = isPersonHeader(line, members);
    if (header) {
      carried = header;
      continue;
    }

    const parsed = parseItem(line, members);
    const { title, dueDate } = parsed;
    let names = parsed.names;
    let inherited = false;
    if (names.length === 0 && carried) {
      names = [carried.name];
      inherited = true;
    }
    out.push(buildRow(line, title, names, dueDate, members, inherited));
  }
  return out;
}

function buildRow(
  line: string,
  title: string,
  names: string[],
  dueDate: string | null,
  members: Member[],
  inherited: boolean
): QuickRow {
  {
    const matches = names.map((n) => matchName(n, members));
    const warnings: string[] = [];

    if (inherited) warnings.push(`위에 적힌 ${names[0]} 님 것으로 봤습니다`);
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
      dueDate,
      assigneeId: ids[0] ?? null,
      deputyIds: ids.slice(1).filter((x): x is string => !!x),
      matches,
      warnings,
    };
  }
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
    // 글에서 읽어낸 기한이 있으면 그걸 쓰고, 없으면 전체 공통으로 넣은 날짜를 쓴다
    due_date: row.dueDate ?? opts.dueDate ?? null,
    progress: 0,
    status: "대기",
  };
}
