/**
 * 엑셀에서 복사한 내용을 우리 업무 양식으로 옮긴다.
 *
 * 엑셀에서 범위를 복사하면 탭으로 칸이 갈리고 줄바꿈으로 줄이 갈린 글자가 넘어온다.
 * 그 글자를 읽어 우리 칼럼(작성일·업무내용·담당자·진행일정·완료일·지시자·진행률·비고)에 맞춘다.
 *
 * 원칙: 확실하지 않으면 비워두고 사람에게 알린다. 짐작해서 채우지 않는다.
 * 특히 담당자는 이름이 정확히 맞지 않으면 미지정으로 둔다 — 엉뚱한 사람에게
 * 업무가 배정되는 것이 비어 있는 것보다 나쁘다.
 */

export type FieldKey =
  | "ignore"
  | "created_at"
  | "title"
  | "description"
  | "assignee"
  | "instructor"
  | "due_date"
  | "completed_at"
  | "progress"
  | "note";

export const FIELD_LABELS: Record<FieldKey, string> = {
  ignore: "— 쓰지 않음 —",
  created_at: "작성일 (지시일)",
  title: "업무내용 (제목)",
  description: "상세내용",
  assignee: "담당자",
  instructor: "지시자",
  due_date: "진행일정 (완료계획일)",
  completed_at: "완료일",
  progress: "진행률",
  note: "비고",
};

/** 엑셀 제목줄에서 자주 쓰는 말들 → 우리 칼럼 */
const HEADER_HINTS: { key: FieldKey; words: string[] }[] = [
  { key: "created_at", words: ["작성일", "등록일", "지시일", "일자", "날짜", "접수일"] },
  { key: "title", words: ["업무내용", "업무", "내용", "제목", "과제", "항목", "건명"] },
  { key: "description", words: ["상세", "세부", "상세내용", "설명"] },
  { key: "assignee", words: ["담당자", "담당", "책임자", "수행자"] },
  { key: "instructor", words: ["지시자", "지시", "요청자", "의뢰자"] },
  { key: "due_date", words: ["진행일정", "완료계획", "계획일", "마감", "기한", "목표일", "예정일"] },
  { key: "completed_at", words: ["완료일", "완료", "종료일", "처리일"] },
  { key: "progress", words: ["진행률", "진척", "진행율", "달성률", "진도"] },
  { key: "note", words: ["비고", "특이사항", "참고", "메모", "remark"] },
];

/** 붙여넣은 글자를 줄·칸으로 가른다 */
export function splitPasted(text: string): string[][] {
  const rows = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  // 탭이 하나도 없으면 쉼표로 갈린 것(CSV)일 수 있다
  const useTab = rows.some((r) => r.includes("\t"));
  return rows.map((r) =>
    (useTab ? r.split("\t") : r.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""))
  );
}

/**
 * 날짜처럼 생긴 글자를 YYYY-MM-DD 로 바꾼다.
 * 읽을 수 없으면 null — 억지로 해석하지 않는다.
 */
export function parseDate(raw: string, todayYear = new Date().getFullYear()): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number): string | null => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) return null; // 2월 30일 등
    return `${y}-${pad(m)}-${pad(d)}`;
  };

  // 2026-06-08 / 2026.6.8 / 2026/06/08 (시간이 붙어 있어도 됨)
  let m = s.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);

  // 2026년 6월 8일
  m = s.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return ok(+m[1], +m[2], +m[3]);

  // 6월 8일 (연도 없음 → 올해로 본다)
  m = s.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일?/);
  if (m) return ok(todayYear, +m[1], +m[2]);

  // 6/8 또는 6-8 (연도 없음 → 올해로 본다)
  m = s.match(/^(\d{1,2})[-./](\d{1,2})$/);
  if (m) return ok(todayYear, +m[1], +m[2]);

  // 20260608
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return ok(+m[1], +m[2], +m[3]);

  // 엑셀이 날짜를 숫자로 넘기는 경우 (1899-12-30 부터 센 날수)
  m = s.match(/^(\d{5})(?:\.\d+)?$/);
  if (m) {
    const serial = +m[1];
    if (serial > 20000 && serial < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    }
  }

  return null;
}

/** 진행률처럼 생긴 글자를 0~100 숫자로 */
export function parseProgress(raw: string): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (!m) return null;
  let v = Number(m[1]);
  if (v > 0 && v <= 1 && s.includes(".") && !s.includes("%")) v = v * 100; // 0.5 → 50%
  if (v < 0 || v > 100) return null;
  return Math.round(v / 5) * 5;
}

/** 직급을 떼고 이름만 남긴다 ("이준호 책임" → "이준호") */
const TITLES = [
  "책임","매니저","팀장","실장","사원","주임","대리","과장","차장","부장",
  "공장장","대표","이사","상무","전무","기사","반장","조장","님",
];
export function bareName(raw: string): string {
  let s = (raw ?? "").trim();
  for (const t of TITLES) {
    s = s.replace(new RegExp(`\\s*${t}\\s*$`), "");
  }
  return s.replace(/\s+/g, "");
}

/** 제목줄인지 판단한다 (칸 이름들이 우리가 아는 말과 겹치면 제목줄) */
export function looksLikeHeader(row: string[]): boolean {
  const hits = row.filter((c) =>
    HEADER_HINTS.some((h) => h.words.some((w) => c.replace(/\s/g, "").includes(w)))
  ).length;
  return hits >= 2;
}

/**
 * 칸마다 어떤 항목인지 정한다.
 * 1) 제목줄이 있으면 그 말을 보고 정한다
 * 2) 없으면 내용을 보고 짐작한다 (날짜꼴 / 이름 일치 / 가장 긴 글)
 */
export function guessMapping(
  rows: string[][],
  hasHeader: boolean,
  memberNames: string[]
): FieldKey[] {
  const width = Math.max(...rows.map((r) => r.length));
  const map: FieldKey[] = new Array(width).fill("ignore");
  const used = new Set<FieldKey>();

  const take = (i: number, key: FieldKey) => {
    if (used.has(key)) return;
    map[i] = key;
    used.add(key);
  };

  if (hasHeader) {
    const header = rows[0];
    for (let i = 0; i < width; i++) {
      const cell = (header[i] ?? "").replace(/\s/g, "");
      if (!cell) continue;
      // NO. 같은 순번 칸은 버린다 (우리 쪽에서 자동으로 붙인다)
      if (/^(no\.?|번호|순번|연번)$/i.test(cell)) continue;
      for (const h of HEADER_HINTS) {
        if (h.words.some((w) => cell.includes(w))) {
          take(i, h.key);
          break;
        }
      }
    }
  }

  // 아직 못 정한 칸은 내용을 보고 짐작한다
  const body = hasHeader ? rows.slice(1) : rows;
  const bare = new Set(memberNames.map(bareName));

  const stat = (i: number) => {
    const vals = body.map((r) => (r[i] ?? "").trim()).filter((v) => v !== "");
    if (vals.length === 0) return { dateRate: 0, nameRate: 0, avgLen: 0, n: 0 };
    const dates = vals.filter((v) => parseDate(v) !== null).length;
    const names = vals.filter((v) => bare.has(bareName(v))).length;
    const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;
    return { dateRate: dates / vals.length, nameRate: names / vals.length, avgLen, n: vals.length };
  };

  const pending = [];
  for (let i = 0; i < width; i++) if (map[i] === "ignore") pending.push(i);

  // 담당자: 팀원 이름과 가장 많이 맞는 칸
  if (!used.has("assignee")) {
    let best = -1;
    let bestRate = 0;
    for (const i of pending) {
      const s = stat(i);
      if (s.nameRate > bestRate && s.nameRate >= 0.5) {
        best = i;
        bestRate = s.nameRate;
      }
    }
    if (best >= 0) take(best, "assignee");
  }

  // 날짜 칸들: 왼쪽부터 작성일 → 진행일정 → 완료일 순으로 본다
  const dateCols = pending
    .filter((i) => map[i] === "ignore" && stat(i).dateRate >= 0.6)
    .sort((a, b) => a - b);
  for (const i of dateCols) {
    if (!used.has("created_at")) take(i, "created_at");
    else if (!used.has("due_date")) take(i, "due_date");
    else if (!used.has("completed_at")) take(i, "completed_at");
  }

  // 업무내용: 남은 칸 중 글이 가장 긴 칸
  if (!used.has("title")) {
    let best = -1;
    let bestLen = 0;
    for (const i of pending) {
      if (map[i] !== "ignore") continue;
      const s = stat(i);
      if (s.n > 0 && s.avgLen > bestLen) {
        best = i;
        bestLen = s.avgLen;
      }
    }
    if (best >= 0) take(best, "title");
  }

  return map;
}

export type ParsedRow = {
  /** 원본 줄 번호 (1부터) */
  line: number;
  title: string;
  description: string | null;
  assigneeName: string;
  /** 이름이 등록된 팀원과 맞았는지. 안 맞으면 미지정으로 넣는다 */
  assigneeId: string | null;
  instructor: string | null;
  createdAt: string | null;
  dueDate: string | null;
  completedAt: string | null;
  progress: number | null;
  note: string | null;
  /** 사람이 확인해야 할 점 */
  warnings: string[];
  /** 등록할지 여부 (사용자가 끌 수 있다) */
  include: boolean;
  /** 이미 같은 업무가 있는지 */
  duplicate: boolean;
};

export function buildRows(
  rows: string[][],
  hasHeader: boolean,
  mapping: FieldKey[],
  members: { id: string; name: string }[],
  existing: { title: string; created_at: string }[]
): ParsedRow[] {
  const body = hasHeader ? rows.slice(1) : rows;
  const offset = hasHeader ? 2 : 1;

  const byBare = new Map(members.map((m) => [bareName(m.name), m.id]));
  const existingKeys = new Set(
    existing.map((e) => `${e.title.trim()}|${e.created_at.slice(0, 10)}`)
  );

  const col = (r: string[], key: FieldKey): string => {
    const i = mapping.indexOf(key);
    if (i < 0) return "";
    return (r[i] ?? "").trim();
  };

  return body.map((r, idx) => {
    const warnings: string[] = [];

    const title = col(r, "title");
    if (!title) warnings.push("업무내용이 비어 있습니다");

    const assigneeName = col(r, "assignee");
    let assigneeId: string | null = null;
    if (assigneeName) {
      assigneeId = byBare.get(bareName(assigneeName)) ?? null;
      if (!assigneeId) warnings.push(`담당자 "${assigneeName}" 를 찾지 못해 미지정으로 넣습니다`);
    }

    const rawCreated = col(r, "created_at");
    const createdAt = parseDate(rawCreated);
    if (rawCreated && !createdAt) warnings.push(`작성일 "${rawCreated}" 를 날짜로 읽지 못했습니다`);

    const rawDue = col(r, "due_date");
    const dueDate = parseDate(rawDue);
    if (rawDue && !dueDate) warnings.push(`진행일정 "${rawDue}" 를 날짜로 읽지 못했습니다`);

    const rawDone = col(r, "completed_at");
    const completedAt = parseDate(rawDone);
    if (rawDone && !completedAt) warnings.push(`완료일 "${rawDone}" 를 날짜로 읽지 못했습니다`);

    if (createdAt && completedAt && completedAt < createdAt) {
      warnings.push("완료일이 작성일보다 앞섭니다");
    }

    const rawProgress = col(r, "progress");
    const progress = parseProgress(rawProgress);
    if (rawProgress && progress === null) {
      warnings.push(`진행률 "${rawProgress}" 를 숫자로 읽지 못했습니다`);
    }

    const duplicate = !!title && existingKeys.has(`${title}|${createdAt ?? ""}`);
    if (duplicate) warnings.push("이미 같은 업무가 있습니다 (건너뜁니다)");

    return {
      line: idx + offset,
      title,
      description: col(r, "description") || null,
      assigneeName,
      assigneeId,
      instructor: col(r, "instructor") || null,
      createdAt,
      dueDate,
      completedAt,
      progress,
      note: col(r, "note") || null,
      warnings,
      include: !!title && !duplicate,
      duplicate,
    };
  });
}

/** 등록할 행을 DB 에 넣을 모양으로 바꾼다 */
export function toInsert(row: ParsedRow, createdBy: string) {
  // 완료일이 있으면 완료로, 진행률이 있으면 그에 맞는 상태로 둔다
  const progress = row.progress ?? (row.completedAt ? 100 : 0);
  const status = row.completedAt || progress >= 100 ? "완료" : progress > 0 ? "진행중" : "대기";

  return {
    title: row.title,
    description: row.description,
    assignee_id: row.assigneeId,
    created_by: createdBy,
    instructor: row.instructor,
    note: row.note,
    due_date: row.dueDate,
    start_date: row.createdAt,
    progress,
    status,
    // 엑셀의 날짜를 그대로 쓴다. 오늘로 넣으면 소요일이 전부 틀어진다.
    ...(row.createdAt ? { created_at: `${row.createdAt}T09:00:00+09:00` } : {}),
    ...(row.completedAt ? { completed_at: `${row.completedAt}T12:00:00+09:00` } : {}),
    // 옮겨온 과거 업무는 "확인했습니다"를 받을 필요가 없으므로 신규 표시를 끈다
    confirmed_at: new Date().toISOString(),
  };
}
