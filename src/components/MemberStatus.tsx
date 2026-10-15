"use client";

import { useMemo, useState } from "react";
import type { Group, Profile } from "@/lib/types";
import { byDisplayOrder, isAssignable } from "@/lib/roles";
import { cn, formatElapsed } from "@/lib/utils";

/**
 * 팀원 현황 — 누가 준비를 끝냈고, 누가 실제로 쓰고 있는지.
 *
 * 배포 첫 주에는 "주소와 1234를 뿌렸는데 누가 아직 안 했나"가 궁금하고,
 * 그 뒤에는 "실제로 보고는 있나"가 궁금하다. 둘은 다른 질문이라 칸을 나눈다.
 *
 * 준비 단계는 두 값으로만 판단한다 — OTP 등록(mfa_enabled)과
 * 비밀번호 변경(password_changed). 둘 다 참이면 끝난 것이다.
 */

/** 며칠 넘게 안 들어오면 눈에 띄게 할지 */
const QUIET_DAYS = 7;

type Stage = "시작 전" | "설정 중" | "준비 완료";

function stageOf(p: Profile): Stage {
  const entered = new Date(p.last_seen_at).getTime() > new Date(p.created_at).getTime() + 60_000;
  if (!entered) return "시작 전";
  if (p.mfa_enabled && p.password_changed) return "준비 완료";
  return "설정 중";
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function MemberStatus({
  profiles,
  groups,
}: {
  profiles: Profile[];
  groups: Group[];
}) {
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => {
    return profiles
      .filter((p) => isAssignable(p))
      .sort(byDisplayOrder)
      .map((p) => {
        const stage = stageOf(p);
        const entered = stage !== "시작 전";
        return {
          p,
          stage,
          entered,
          groupName: groups.find((g) => g.id === p.group_id)?.name ?? null,
          quiet: entered && daysSince(p.last_seen_at) >= QUIET_DAYS,
        };
      });
  }, [profiles, groups]);

  const done = rows.filter((r) => r.stage === "준비 완료").length;
  const notStarted = rows.filter((r) => r.stage === "시작 전").length;
  const quiet = rows.filter((r) => r.quiet).length;
  const allReady = rows.length > 0 && done === rows.length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden print-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 flex-wrap"
      >
        <span className="font-bold text-gray-900">팀원 현황</span>

        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            allReady ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
          )}
        >
          준비 완료 {done} / {rows.length}
        </span>

        {notStarted > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            아직 안 들어온 사람 {notStarted}
          </span>
        )}
        {quiet > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {QUIET_DAYS}일 넘게 안 봄 {quiet}
          </span>
        )}

        <span className="flex-1" />
        <span className="no-print text-sm text-gray-400">{open ? "접기" : "펴기"}</span>
      </button>

      <div className={cn(!open && "hidden print:block")}>
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {rows.map(({ p, stage, entered, groupName, quiet: isQuiet }) => (
            <li key={p.id} className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900 break-keep">{p.name}</span>
              {p.position && <span className="text-xs text-gray-400">{p.position}</span>}
              {p.role !== "팀원" && (
                <span className="text-[11px] text-blue-700">{p.role}</span>
              )}
              {groupName && <span className="text-xs text-gray-400">· {groupName}</span>}

              <span className="flex-1" />

              {/* 실제로 보고 있는가 */}
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  !entered ? "text-gray-300" : isQuiet ? "text-amber-600" : "text-gray-500"
                )}
              >
                {entered ? formatElapsed(p.last_seen_at) : "접속 없음"}
              </span>

              {/* 준비가 어디까지 됐는가 */}
              <span
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap",
                  stage === "준비 완료"
                    ? "bg-emerald-50 text-emerald-700"
                    : stage === "설정 중"
                      ? "bg-blue-50 text-blue-700"
                      : "bg-amber-50 text-amber-700"
                )}
              >
                {stage}
              </span>
            </li>
          ))}

          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-400">등록된 인원이 없습니다.</li>
          )}
        </ul>

        {notStarted > 0 && (
          <p className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-500 break-keep">
            「시작 전」인 분께는 <b>회사 메일 + 비밀번호 1234</b> 로 들어오시라고 알려주세요. 처음
            들어오면 OTP 등록과 비밀번호 변경이 자동으로 뜹니다. 자세한 순서는 왼쪽 메뉴{" "}
            <b>사용방법</b>에 있습니다.
          </p>
        )}
      </div>
    </section>
  );
}
