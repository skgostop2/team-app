import * as XLSX from "xlsx";
import type { Profile, TaskWithEffectiveStatus } from "./types";
import type { WeeklyPerson } from "./weekly";
import { formatDate } from "./utils";

/**
 * 엑셀 내보내기 — 회의 자료나 상부 보고에 붙이기 위한 것.
 * 화면에 보이는 그대로를 표로 만든다. 비고 칸은 항상 맨 오른쪽.
 */

function save(wb: XLSX.WorkBook, name: string) {
  XLSX.writeFile(wb, name.replace(/[\\/:*?"<>|]/g, "_"), { compression: true });
}

function sheet(rows: (string | number | null)[][], widths: number[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  return ws;
}

/** 업무 표 → 한 장 */
export function exportTasks(
  tasks: TaskWithEffectiveStatus[],
  profiles: Profile[],
  title: string
) {
  const nameOf = (id: string | null) => profiles.find((p) => p.id === id)?.name ?? "";
  const rows: (string | number | null)[][] = [
    ["번호", "업무명", "담당", "참여", "지시자", "등록일", "진행일정", "완료계획일", "완료일", "진행률(%)", "상태", "긴급", "상세내용", "비고"],
    ...tasks.map((t, i) => [
      i + 1,
      t.title,
      nameOf(t.assignee_id),
      (t.deputy_ids ?? []).map(nameOf).filter(Boolean).join(", "),
      t.instructor ?? "",
      formatDate(t.created_at),
      t.start_date ? formatDate(t.start_date) : "",
      t.due_date ? formatDate(t.due_date) : "",
      t.completed_at ? formatDate(t.completed_at) : "",
      t.progress ?? 0,
      t.effective_status,
      t.urgent ? "긴급" : "",
      t.description ?? "",
      t.note ?? "",
    ]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(rows, [5, 40, 8, 12, 8, 11, 11, 11, 11, 9, 7, 5, 40, 20]), "업무");
  save(wb, `${title} ${formatDate(new Date().toISOString())}.xlsx`);
}

/** 주간 계획대비 실적 → 금주 실적 / 차주 계획 두 장 */
export function exportWeekly(people: WeeklyPerson[], weekLabel: string) {
  const thisRows: (string | number | null)[][] = [
    ["담당", "업무명", "상태", "진행률(%)", "완료계획일", "금주 실적(진행기록)", "비고"],
  ];
  const nextRows: (string | number | null)[][] = [["담당", "업무명", "완료계획일", "진행률(%)", "비고"]];
  for (const p of people) {
    for (const r of p.rows) {
      thisRows.push([
        p.profile.name,
        r.task.title,
        r.task.effective_status + (r.carried ? " (이월)" : ""),
        r.task.progress ?? 0,
        r.task.due_date ? formatDate(r.task.due_date) : "",
        r.notes.map((n) => `· ${n.content}`).join("\n"),
        r.task.note ?? "",
      ]);
    }
    for (const t of p.next) {
      nextRows.push([p.profile.name, t.title, t.due_date ? formatDate(t.due_date) : "", t.progress ?? 0, t.note ?? ""]);
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(thisRows, [8, 40, 10, 9, 11, 50, 20]), "금주 실적");
  XLSX.utils.book_append_sheet(wb, sheet(nextRows, [8, 40, 11, 9, 20]), "차주 계획");
  save(wb, `주간 계획대비 실적 ${weekLabel}.xlsx`);
}

/** 잔업 — 월 집계(사람 × 날짜) 와 내역 두 장 */
export function exportOvertime(opts: {
  ym: string;
  days: string[];
  people: { id: string; name: string }[];
  entries: { user_id: string; work_date: string; minutes: number; end_time: string | null; task_title: string | null; note: string | null }[];
  totalByUser: Map<string, number>;
}) {
  const { ym, days, people, entries, totalByUser } = opts;
  const byKey = new Map(entries.map((e) => [`${e.user_id}|${e.work_date}`, e]));
  const h = (min: number) => Math.round((min / 60) * 10) / 10;

  const head: (string | number | null)[] = ["이름", ...days.map((d) => `${Number(d.slice(8))}일`), "월 합계(h)", "누적(h)", "비고"];
  const rows: (string | number | null)[][] = [head];
  for (const p of people) {
    let sum = 0;
    const cells = days.map((d) => {
      const e = byKey.get(`${p.id}|${d}`);
      if (!e) return "";
      sum += e.minutes;
      return h(e.minutes);
    });
    rows.push([p.name, ...cells, h(sum), h(totalByUser.get(p.id) ?? 0), ""]);
  }

  const detail: (string | number | null)[][] = [["날짜", "이름", "끝난 시각", "시간(h)", "업무", "메모", "비고"]];
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  for (const e of [...entries].filter((x) => x.work_date.startsWith(ym)).sort((a, b) => a.work_date.localeCompare(b.work_date))) {
    detail.push([e.work_date, nameOf.get(e.user_id) ?? "", e.end_time ?? "없음", h(e.minutes), e.task_title ?? "", e.note ?? "", ""]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(rows, [10, ...days.map(() => 5), 10, 9, 16]), "월 집계");
  XLSX.utils.book_append_sheet(wb, sheet(detail, [12, 10, 10, 8, 40, 30, 16]), "내역");
  save(wb, `잔업 현황 ${ym}.xlsx`);
}
