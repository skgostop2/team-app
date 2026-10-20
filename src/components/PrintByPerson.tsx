"use client";

import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import type { ItemCount } from "@/lib/items";
import { byDisplayOrder, isAssignable } from "@/lib/roles";
import { formatIsoDate, formatShortDate } from "@/lib/utils";

/**
 * 사람별 인쇄.
 *
 * 한 장에 전원을 몰아 찍으면 철해 두고 한 사람씩 보기 어렵다.
 * 사람마다 새 장에서 시작하고, 장마다 이름과 날짜를 박아 둔다 —
 * 종이만 넘겨도 누구 것인지 알 수 있게.
 *
 * 화면에는 나오지 않고 인쇄할 때만 나온다.
 */
export default function PrintByPerson({
  tasks,
  profiles,
  itemCounts,
  title = "업무 진행 현황",
  hideDone = false,
}: {
  tasks: TaskWithEffectiveStatus[];
  profiles: Profile[];
  itemCounts?: Map<string, ItemCount>;
  title?: string;
  hideDone?: boolean;
}) {
  const today = formatIsoDate(new Date().toISOString());
  const people = profiles.filter(isAssignable).sort(byDisplayOrder);

  const groups = people
    .map((p) => ({
      person: p,
      items: tasks
        .filter((t) => t.assignee_id === p.id || (t.deputy_ids ?? []).includes(p.id))
        .filter((t) => !hideDone || t.effective_status !== "완료")
        .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")),
    }))
    .filter((g) => g.items.length > 0);

  const 미지정 = tasks.filter((t) => !t.assignee_id);

  return (
    <div className="hidden print:block">
      {groups.map((g, gi) => {
        const done = g.items.filter((t) => t.effective_status === "완료").length;
        const late = g.items.filter((t) => t.effective_status === "지연").length;
        return (
          <section key={g.person.id} className={gi > 0 ? "print-page-break" : ""}>
            <PersonSheet
              name={`${g.person.name}${g.person.position ? ` ${g.person.position}` : ""}`}
              role={g.person.role}
              title={title}
              today={today}
              total={g.items.length}
              done={done}
              late={late}
              items={g.items}
              itemCounts={itemCounts}
            />
          </section>
        );
      })}

      {미지정.length > 0 && (
        <section className={groups.length > 0 ? "print-page-break" : ""}>
          <PersonSheet
            name="담당자 미지정"
            role=""
            title={title}
            today={today}
            total={미지정.length}
            done={0}
            late={미지정.filter((t) => t.effective_status === "지연").length}
            items={미지정}
            itemCounts={itemCounts}
          />
        </section>
      )}

      {groups.length === 0 && 미지정.length === 0 && (
        <p className="text-sm">인쇄할 업무가 없습니다.</p>
      )}
    </div>
  );
}

function PersonSheet({
  name,
  role,
  title,
  today,
  total,
  done,
  late,
  items,
  itemCounts,
}: {
  name: string;
  role: string;
  title: string;
  today: string;
  total: number;
  done: number;
  late: number;
  items: TaskWithEffectiveStatus[];
  itemCounts?: Map<string, ItemCount>;
}) {
  return (
    <div className="print-table">
      <div className="flex items-baseline justify-between border-b-2 border-black pb-1 mb-2">
        <h2 className="text-base font-bold">
          {name}
          {role && role !== "팀원" && <span className="text-xs font-normal"> ({role})</span>}
        </h2>
        <span className="text-xs">
          {title} · 출력일 {today} · 총 {total}건 (완료 {done} · 지연 {late})
        </span>
      </div>

      <table className="w-full border-collapse text-[8pt]">
        <thead>
          <tr>
            <th className="w-[4%]">NO.</th>
            <th>업무내용</th>
            <th className="w-[8%]">진행일정</th>
            <th className="w-[8%]">완료계획</th>
            <th className="w-[8%]">완료여부</th>
            <th className="w-[7%]">진행률</th>
            <th className="w-[7%]">상태</th>
            <th className="w-[20%]">최근 진행기록 / 비고</th>
            <th className="w-[10%]">확인</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t, i) => {
            const c = itemCounts?.get(t.id);
            return (
              <tr key={t.id}>
                <td className="text-center">{i + 1}</td>
                <td>
                  <span className="font-medium">
                    {t.urgent ? "[긴급] " : ""}
                    {t.title}
                  </span>
                  {t.description && (
                    <span className="block whitespace-pre-wrap">{t.description}</span>
                  )}
                </td>
                <td className="text-center">{formatShortDate(t.start_date) || "—"}</td>
                <td className="text-center">{formatShortDate(t.due_date) || "—"}</td>
                <td className="text-center">
                  {t.completed_at ? `완료 ${formatShortDate(t.completed_at)}` : "미완료"}
                </td>
                <td className="text-center">
                  {t.progress}%{c && c.total > 0 ? ` (${c.done}/${c.total})` : ""}
                </td>
                <td className="text-center">{t.effective_status}</td>
                <td>
                  {t.last_update_text && (
                    <span className="block">
                      {t.last_update_text}
                      <span className="block text-[7pt]">
                        {formatShortDate(t.last_update_at)} {t.last_update_by}
                      </span>
                    </span>
                  )}
                  {t.note && <span className="block">※ {t.note}</span>}
                </td>
                {/* 종이에 손으로 적는 칸 — 회의 때 쓰라고 비워 둔다 */}
                <td />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
