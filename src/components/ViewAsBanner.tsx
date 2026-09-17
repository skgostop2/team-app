"use client";

import Link from "next/link";
import type { Profile } from "@/lib/types";

/**
 * "○○○ 님 화면으로 보는 중" 띠.
 *
 * 팀장·실장이 팀원 화면을 들여다보는 동안 항상 위에 붙어 있어서
 * 지금 남의 시점으로 보고 있다는 것을 잊지 않게 한다.
 * 사람을 바꿔가며 볼 수 있도록 버튼도 함께 둔다.
 *
 * 계정 대리 로그인이 아니다. 팀장이 이미 볼 권한이 있는 데이터를
 * 그 사람 시점으로 다시 그리는 것뿐이다. 개인 메모장은 여기서도 보이지 않는다.
 */
export default function ViewAsBanner({
  current,
  members,
  unconfirmed,
  basePath,
}: {
  current: Profile;
  members: Profile[];
  unconfirmed: number;
  basePath: string;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-900">
            {current.name}
            {current.position ? ` ${current.position}` : ""} 님 화면으로 보는 중
          </p>
          <p className="text-xs text-blue-700 mt-0.5 break-keep">
            이 팀원에게 보이는 그대로입니다. 여기서는 내용을 바꿀 수 없습니다.
            {unconfirmed > 0 && (
              <span className="font-semibold"> · 아직 확인하지 않은 업무 {unconfirmed}건</span>
            )}
          </p>
          <p className="text-[11px] text-blue-600 mt-0.5">
            개인 메모장은 본인만 볼 수 있어 여기서도 보이지 않습니다.
          </p>
        </div>
        <Link
          href={basePath}
          className="text-xs px-3 py-2 rounded-lg bg-white border border-blue-300 text-blue-700 font-medium hover:bg-blue-100 whitespace-nowrap"
        >
          내 화면으로
        </Link>
      </div>

      {members.length > 1 && (
        <div className="flex gap-1.5 flex-wrap pt-1 border-t border-blue-200">
          <span className="text-[11px] text-blue-700 py-1.5">다른 팀원:</span>
          {members
            .filter((m) => m.id !== current.id)
            .map((m) => (
              <Link
                key={m.id}
                href={`${basePath}?as=${m.id}`}
                className="text-[11px] px-2 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100"
              >
                {m.name}
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
