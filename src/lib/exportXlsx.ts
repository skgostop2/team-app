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
