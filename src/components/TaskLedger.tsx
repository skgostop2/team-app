"use client";

import Link from "next/link";
import type { Profile, TaskWithEffectiveStatus } from "@/lib/types";
import { formatShortDate, formatIsoDate, cn } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

/**
 * 업무 진행 현황 — 메모 프로그램과 같은 대장(臺帳) 양식.
 * 한 건에 한 줄씩, 번호를 붙여 위에서 아래로 계속 쌓인다.
 *
 * NO. | 작성일 | 업무내용 | 진행일정 | 완료일 | 담당자 | 지시자 | 진행률 | 상태 | 비고
 */
export default function TaskLedger({
  tasks,
  profiles,
  title = "업무 진행 현황",
  showAssignee = true,
  emptyText = "등록된 업무가 없습니다.",
}: {
  tasks: TaskWithEffectiveStatus[];
  profiles: Profile[];
  title?: string;
  showAssignee?: boolean;
  emptyText?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="flex items-baseline justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-wrap">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400">
          출력일: {formatIsoDate(new Date().toISOString())} &nbsp;|&nbsp; 총 {tasks.length}건
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-blue-50 text-gray-700 text-xs">
              <Th className="w-12 text-center">NO.</Th>
              <Th className="w-28">작성일</Th>
              <Th>업무내용</Th>
              <Th className="w-20 text-center">진행일정</Th>
              <Th className="w-20 text-center">완료일</Th>
              {showAssignee && <Th className="w-24">담당자</Th>}
              <Th className="w-24">지시자</Th>
              <Th className="w-28 text-center">진행률</Th>
              <Th className="w-20 text-center">상태</Th>
              <Th className="w-32">비고</Th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t, i) => {
              const assignee = profiles.find((p) => p.id === t.assignee_id);
              const overdue = t.effective_status === "지연";
              return (
                <tr key={t.id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <Td className="text-center text-gray-500">{i + 1}</Td>
                  <Td className="text-gray-600 whitespace-nowrap">{formatIsoDate(t.created_at)}</Td>
                  <Td>
                    <Link
                      href={`/tasks/${t.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {t.is_new && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5 align-middle" />
                      )}
                      {t.title}
                    </Link>
                    {t.description && (
                      <span className="block text-xs text-gray-400 mt-0.5 line-clamp-1">
                        {t.description}
                      </span>
                    )}
                  </Td>
                  <Td className={cn("text-center whitespace-nowrap", overdue ? "text-red-600 font-medium" : "text-gray-600")}>
                    {formatShortDate(t.due_date)}
                  </Td>
                  <Td className="text-center text-gray-600 whitespace-nowrap">
                    {formatShortDate(t.completed_at)}
                  </Td>
                  {showAssignee && (
                    <Td className="text-gray-600">
                      {assignee?.name ?? ""}
                      {assignee?.status === "삭제" && (
                        <span className="block text-[11px] text-gray-400">(삭제된 계정)</span>
                      )}
                      {assignee?.status === "가입대기" && (
                        <span className="block text-[11px] text-amber-600">(가입대기)</span>
                      )}
                    </Td>
                  )}
                  <Td className="text-gray-600">{t.instructor ?? ""}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden min-w-[40px]">
                        <div className="h-full bg-blue-500" style={{ width: `${t.progress}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-8 text-right">{t.progress}%</span>
                    </div>
                  </Td>
                  <Td className="text-center">
                    <StatusBadge status={t.effective_status} />
                  </Td>
                  <Td className="text-gray-500 text-xs whitespace-pre-wrap">{t.note ?? ""}</Td>
                </tr>
              );
            })}

            {tasks.length === 0 && (
              <tr>
                <td colSpan={showAssignee ? 10 : 9} className="px-4 py-10 text-center text-gray-400">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium text-left border-b border-gray-300 border-r border-gray-200 last:border-r-0",
        className
      )}
    >
      {children}
    </th>
  );
}

function Td({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <td className={cn("px-3 py-2.5 align-top border-r border-gray-100 last:border-r-0", className)}>
      {children}
    </td>
  );
}
