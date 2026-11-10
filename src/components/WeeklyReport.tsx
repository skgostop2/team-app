"use client";

import { useEffect, useRef, useState } from "react";
import type { WeeklyPerson } from "@/lib/weekly";
import type { Week } from "@/lib/week";
import { formatDate } from "@/lib/utils";

/**
 * 주간 업무 보고서 — 회사 전자결재에 붙여 넣는 용도.
 *
 * 원칙:
 *  - 숫자와 표는 프로그램이 채우고, 글은 사람이 고친다. 모든 칸이 화면에서 바로 고쳐진다.
 *  - 회사 보고서 순서: 목적 → 내용(일정 → 누가 → 세부) → 검토 사항. 한 장.
 *  - 경영층에 "하라"는 표현은 쓰지 않는다 — 「검토 사항」으로 적는다.
 *  - 결재선: 담당 / 책임 / 팀장 / 실장 / 공장장 / 대표이사 / 부회장 (칸 이름도 고칠 수 있다)
 *  - 표 맨 오른쪽은 비고.
 */
export default function WeeklyReport({
  people,
  week,
  next,
  teamName,
  author,
  onClose,
}: {
  people: WeeklyPerson[];
  week: Week;
  next: Week;
  teamName: string;
  author: string;
  onClose: () => void;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // 인쇄할 때 뒤에 깔린 화면이 같이 찍히지 않게
  useEffect(() => {
    document.body.classList.add("report-open");
    // 보고서는 종이처럼 — 어두운 화면 설정 중이어도 밝게 보여주고, 닫으면 되돌린다
    const prev = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = "light";
    return () => {
      document.body.classList.remove("report-open");
      document.documentElement.dataset.theme = prev ?? "sf";
    };
  }, []);

  const done = people.reduce((n, p) => n + p.done, 0);
  const running = people.reduce((n, p) => n + p.running, 0);
  const late = people.reduce((n, p) => n + p.late, 0);
  const lateRows = people.flatMap((p) => p.rows.filter((r) => r.overdue).map((r) => ({ who: p.profile.name, r })));

  /** 전자결재에 붙여 넣기 — 서식 있는 글(HTML)과 그냥 글을 같이 넣는다 */
  async function copy() {
    const el = sheet.current;
    if (!el) return;
    const html = el.innerHTML;
    const text = el.innerText;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.alert("복사하지 못했습니다. 본문을 마우스로 긁어 복사해 주세요.");
    }
  }

  const E = { contentEditable: true, suppressContentEditableWarning: true } as const;

  return (
    <div className="report-root fixed inset-0 z-50 bg-gray-100 overflow-y-auto print:static print:bg-white print:overflow-visible">
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-gray-900">주간 업무 보고서</span>
        <span className="text-xs text-gray-500 break-keep">
          칸을 누르면 바로 고쳐집니다. 고친 뒤 「복사」해서 전자결재에 붙여 넣거나 「인쇄」로 PDF.
        </span>
        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={copy}
            className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
          >
            {copied ? "복사됨 ✓" : "복사 (전자결재용)"}
          </button>
          <button
            onClick={() => window.print()}
            className="text-xs px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            인쇄 · PDF
          </button>
          <button onClick={onClose} className="text-xs px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100">
            닫기
          </button>
        </span>
      </div>

      <div className="mx-auto my-4 print:my-0 max-w-[210mm] bg-white shadow print:shadow-none">
        <div
          ref={sheet}
          className="p-10 print:p-8 text-[13px] leading-relaxed text-gray-900"
          style={{ fontFamily: "'현대하모니 L', 'Hyundai Harmony', Pretendard, sans-serif" }}
        >
          {/* 머리: 제목 + 결재선 */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight" {...E}>
                {teamName} 주간 업무 보고
              </h1>
              <p className="mt-1 text-gray-600" {...E}>
                {week.label} · 작성 {formatDate(new Date().toISOString())} · {teamName} {author}
              </p>
            </div>
            <table className="border-collapse text-[11px] text-center shrink-0">
              <tbody>
                <tr>
                  {["담당", "책임", "팀장", "실장", "공장장", "대표이사", "부회장"].map((k) => (
                    <td key={k} className="border border-gray-700 px-2 py-0.5 bg-gray-50 font-medium" {...E}>
                      {k}
                    </td>
                  ))}
                </tr>
                <tr>
                  {Array.from({ length: 7 }).map((_, i) => (
                    <td key={i} className="border border-gray-700 h-10 min-w-[44px]" {...E} />
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 1. 목적 */}
          <h2 className="mt-5 font-bold text-base">1. 목적</h2>
          <p {...E}>
            금주({week.label}) {teamName} 업무 진행 실적과 차주 계획을 보고드리고, 검토가 필요한 사항을 말씀드리고자 함.
          </p>

          {/* 2. 요약 */}
          <h2 className="mt-4 font-bold text-base">2. 금주 요약</h2>
          <table className="w-full border-collapse mt-1 text-center">
            <thead>
              <tr className="bg-gray-100">
                {["진행 업무", "완료", "진행중", "지연", "비고"].map((h) => (
                  <th key={h} className="border border-gray-500 px-2 py-1 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-500 px-2 py-1" {...E}>{done + running + late}건</td>
                <td className="border border-gray-500 px-2 py-1" {...E}>{done}건</td>
                <td className="border border-gray-500 px-2 py-1" {...E}>{running}건</td>
                <td className="border border-gray-500 px-2 py-1 text-red-700 font-medium" {...E}>{late}건</td>
                <td className="border border-gray-500 px-2 py-1 text-left" {...E}></td>
              </tr>
            </tbody>
          </table>

          {/* 3. 금주 실적 */}
          <h2 className="mt-4 font-bold text-base">3. 금주 실적</h2>
          <table className="w-full border-collapse mt-1">
            <thead>
              <tr className="bg-gray-100 text-center">
                <th className="border border-gray-500 px-2 py-1 font-medium w-14">담당</th>
                <th className="border border-gray-500 px-2 py-1 font-medium">업무</th>
                <th className="border border-gray-500 px-2 py-1 font-medium w-14">진행률</th>
                <th className="border border-gray-500 px-2 py-1 font-medium w-20">계획일</th>
                <th className="border border-gray-500 px-2 py-1 font-medium">실적</th>
                <th className="border border-gray-500 px-2 py-1 font-medium w-20">비고</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) =>
                p.rows.map((r, i) => (
                  <tr key={r.task.id} className={r.overdue ? "bg-red-50" : ""}>
                    {i === 0 && (
                      <td rowSpan={p.rows.length} className="border border-gray-500 px-2 py-1 text-center align-top font-medium" {...E}>
                        {p.profile.name}
                      </td>
                    )}
                    <td className="border border-gray-500 px-2 py-1 break-keep" {...E}>{r.task.title}</td>
                    <td className="border border-gray-500 px-2 py-1 text-center" {...E}>{r.task.progress ?? 0}%</td>
                    <td className="border border-gray-500 px-2 py-1 text-center" {...E}>
                      {r.task.due_date ? formatDate(r.task.due_date).slice(5) : "-"}
                    </td>
                    <td className="border border-gray-500 px-2 py-1 break-keep whitespace-pre-wrap" {...E}>
                      {r.task.effective_status === "완료"
                        ? "완료"
                        : r.notes.length > 0
                          ? r.notes.map((n) => `· ${n.content}`).join("\n")
                          : ""}
                    </td>
                    <td className="border border-gray-500 px-2 py-1 break-keep" {...E}>
                      {r.overdue ? "지연" : r.carried ? "이월" : ""}
                    </td>
                  </tr>
                ))
              )}
              {people.every((p) => p.rows.length === 0) && (
                <tr>
                  <td colSpan={6} className="border border-gray-500 px-2 py-3 text-center text-gray-500">이번 주에 걸린 업무가 없습니다</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 4. 차주 계획 */}
          <h2 className="mt-4 font-bold text-base">4. 차주 계획 ({next.label})</h2>
          <table className="w-full border-collapse mt-1">
            <thead>
              <tr className="bg-gray-100 text-center">
                <th className="border border-gray-500 px-2 py-1 font-medium w-14">담당</th>
                <th className="border border-gray-500 px-2 py-1 font-medium">업무</th>
                <th className="border border-gray-500 px-2 py-1 font-medium w-20">계획일</th>
                <th className="border border-gray-500 px-2 py-1 font-medium w-20">비고</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) =>
                p.next.map((t, i) => (
                  <tr key={t.id}>
                    {i === 0 && (
                      <td rowSpan={p.next.length} className="border border-gray-500 px-2 py-1 text-center align-top font-medium" {...E}>
                        {p.profile.name}
                      </td>
                    )}
                    <td className="border border-gray-500 px-2 py-1 break-keep" {...E}>{t.title}</td>
                    <td className="border border-gray-500 px-2 py-1 text-center" {...E}>
                      {t.due_date ? formatDate(t.due_date).slice(5) : "-"}
                    </td>
                    <td className="border border-gray-500 px-2 py-1" {...E}></td>
                  </tr>
                ))
              )}
              {people.every((p) => p.next.length === 0) && (
                <tr>
                  <td colSpan={4} className="border border-gray-500 px-2 py-3 text-center text-gray-500">다음 주 계획이 없습니다</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* 5. 지연·특이사항 */}
          <h2 className="mt-4 font-bold text-base">5. 지연 · 특이사항</h2>
          <div className="mt-1 min-h-[3em] whitespace-pre-wrap break-keep" {...E}>
            {lateRows.length > 0
              ? lateRows.map(({ who, r }) => `· ${who} — ${r.task.title} (계획 ${r.task.due_date ? formatDate(r.task.due_date).slice(5) : "-"}, ${r.task.progress ?? 0}%)`).join("\n")
              : "· 지연 업무 없음"}
          </div>

          {/* 6. 검토 사항 */}
          <h2 className="mt-4 font-bold text-base">6. 검토 사항</h2>
          <div className="mt-1 min-h-[3em] whitespace-pre-wrap break-keep text-gray-700" {...E}>
            · (경영층 검토가 필요한 사항이 있으면 여기에)
          </div>

          <p className="mt-6 text-right text-gray-600" {...E}>
            {teamName} {author} 올림
          </p>
        </div>
      </div>
    </div>
  );
}
