"use client";

import type { Profile } from "@/lib/types";
import QuickAssignForm from "@/components/QuickAssignForm";

/**
 * 빠른 등록 팝업 — 업무 화면에서 급할 때 쓴다.
 *
 * 알맹이는 업무지시 화면과 똑같다 (QuickAssignForm).
 * 여러 줄을 한 번에 다룰 때는 왼쪽 메뉴의 업무지시 화면이 편하다.
 */
export default function QuickAddModal({
  members,
  createdBy,
  instructorDefault,
  onClose,
  onDone,
}: {
  members: Profile[];
  createdBy: string;
  instructorDefault?: string | null;
  onClose: () => void;
  onDone: (count: number) => void;
}) {
  return (
    <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-start md:items-center justify-center p-0 md:p-4 overflow-y-auto">
      <div className="bg-white w-full md:max-w-3xl md:rounded-2xl p-4 md:p-5 md:my-4 min-h-dvh md:min-h-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-lg font-bold text-gray-900">빠른 등록</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
            title="닫기"
          >
            ×
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-3 break-keep">
          여러 줄을 한 번에 붙여넣으면 이름과 기한을 찾아 건별로 정리합니다.
        </p>

        <QuickAssignForm
          members={members}
          createdBy={createdBy}
          instructorDefault={instructorDefault}
          layout="modal"
          onDone={onDone}
        />

        <button
          onClick={onClose}
          className="w-full mt-2 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-600 hover:bg-gray-50"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
