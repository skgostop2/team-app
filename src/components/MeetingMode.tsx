"use client";

import { useCallback, useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import type { WeeklyPerson } from "@/lib/weekly";
import type { Week } from "@/lib/week";
import { cn } from "@/lib/utils";
import { PersonBlock } from "@/components/WeeklyBoard";
import TaskEditModal from "@/components/TaskEditModal";

/**
 * 회의 모드 — 회의실 큰 화면에 띄우고 한 사람씩 넘긴다.
 *
 * 일하는 화면과 보는 조건이 다르다. 3~4m 떨어져서 보므로 글자를 키우고,
 * 7명이 한 화면에 안 들어가므로 스크롤 대신 사람을 넘긴다.
 *
 * 차트나 달성률 게이지는 넣지 않는다. 회의에서 필요한 것은
 * "이번 주 뭐가 막혔나" 하나이고, 숫자를 띄우면 숫자 구경이 된다.
 *
 * 화면에서 바로 고칠 수 있다 — 회의가 끝나면 정리도 끝난다.
 * 바뀐 것은 전부 이력에 남는다.
 */

/** 회의실 화면 크기가 제각각이라 그 자리에서 조절한다 */
const ZOOM = [0.8, 1, 1.25, 1.5] as const;

export default function MeetingMode({
  people,
  week,
  profiles,
  canEdit,
  onClose,
  onChanged,
}: {
  people: WeeklyPerson[];
  week: Week;
  profiles: Profile[];
  canEdit: boolean;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [at, setAt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);

  const total = people.length;
  const person = people[at];

  const go = useCallback(
    (by: number) => {
      setAt((i) => Math.min(Math.max(i + by, 0), Math.max(total - 1, 0)));
    },
    [total]
  );

  // 화살표·스페이스로 넘긴다. 수정 창이 열려 있으면 그쪽이 먼저다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (detailId) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        setZoom((z) => ZOOM[Math.min(ZOOM.indexOf(z as never) + 1, ZOOM.length - 1)] ?? z);
      } else if (e.key === "-") {
        setZoom((z) => ZOOM[Math.max(ZOOM.indexOf(z as never) - 1, 0)] ?? z);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, detailId]);

  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // 브라우저가 막으면 그냥 창 화면으로 쓴다
    }
  }

  if (total === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col items-center justify-center gap-4">
        <p className="text-2xl text-gray-500">이번 주에 걸린 업무가 없습니다.</p>
        <button
          onClick={onClose}
          className="px-5 py-3 rounded-xl border border-gray-300 text-gray-600 text-lg hover:bg-white"
        >
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
      {/* 머리 — 주차와 진행 위치 */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white flex-wrap">
        <span className="text-xl font-bold text-gray-900">{week.title}</span>
        <span className="text-base text-gray-400">{week.label}</span>
        <span className="flex-1" />

        <span className="text-base text-gray-500">
          {at + 1} / {total}
        </span>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setZoom(ZOOM[Math.max(ZOOM.indexOf(zoom as never) - 1, 0)])}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="글자 작게"
          >
            가−
          </button>
          <button
            onClick={() =>
              setZoom(ZOOM[Math.min(ZOOM.indexOf(zoom as never) + 1, ZOOM.length - 1)])
            }
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="글자 크게"
          >
            가+
          </button>
          <button
            onClick={fullscreen}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            전체화면
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            회의 끝
          </button>
        </div>
      </header>

      {/* 본문 — 한 사람 */}
      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col justify-center">
        <div
          style={{ fontSize: `${zoom}rem` }}
          className="mx-auto w-full max-w-[1600px] origin-top"
        >
          <PersonBlock
            person={person}
            week={week}
            big
            onPick={canEdit ? setDetailId : undefined}
          />
          {canEdit && (
            <p className="mt-3 text-center text-base text-gray-400">
              업무를 누르면 그 자리에서 고칠 수 있습니다. 바뀐 내용은 이력에 남습니다.
            </p>
          )}
        </div>
      </div>

      {/* 발 — 사람 넘기기 */}
      <footer className="shrink-0 border-t border-gray-200 bg-white px-5 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            disabled={at === 0}
            className="px-5 py-3 rounded-xl border border-gray-300 text-gray-700 text-lg font-medium hover:bg-gray-50 disabled:opacity-40"
          >
            ‹ 이전
          </button>

          {/* 누구 차례인지 한눈에 — 눌러서 바로 갈 수도 있다 */}
          <div className="flex-1 flex items-center gap-1.5 overflow-x-auto">
            {people.map((p, i) => (
              <button
                key={p.profile.id}
                onClick={() => setAt(i)}
                className={cn(
                  "shrink-0 px-3 py-2 rounded-lg text-base whitespace-nowrap border",
                  i === at
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                )}
              >
                {p.profile.name}
                {p.late > 0 && (
                  <span className={cn("ml-1.5", i === at ? "text-blue-100" : "text-amber-600")}>
                    {p.late}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            onClick={() => go(1)}
            disabled={at >= total - 1}
            className="px-5 py-3 rounded-xl bg-blue-600 text-white text-lg font-medium hover:bg-blue-700 disabled:opacity-40"
          >
            다음 ›
          </button>
        </div>
        <p className="mt-2 text-center text-sm text-gray-400">
          화살표 키 또는 스페이스로 넘깁니다 · + − 로 글자 크기 · Esc 로 끝냅니다
        </p>
      </footer>

      {detailId && (
        <TaskEditModal
          taskId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}
