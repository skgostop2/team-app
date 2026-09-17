"use client";

import TaskDetail from "@/components/TaskDetail";

/**
 * 표 위에 떠서 업무를 고치는 창.
 *
 * 화면을 옮기지 않으므로 표에서 보던 자리를 잃지 않는다.
 * 안에는 상세 화면과 똑같은 내용이 들어간다 (제목·내용·일정·완료일·담당자·비고·변경이력).
 */
export default function TaskEditModal({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <div
      className="no-print fixed inset-0 z-40 bg-black/40 flex items-start md:items-center justify-center p-0 md:p-4 overflow-y-auto"
      onClick={(e) => {
        // 바깥을 눌러 닫는다. 창 안을 누른 경우는 닫지 않는다.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white w-full md:max-w-2xl md:rounded-2xl p-5 md:my-4 min-h-dvh md:min-h-0">
        <TaskDetail taskId={taskId} inModal onClose={onClose} onChanged={onChanged} />
      </div>
    </div>
  );
}
