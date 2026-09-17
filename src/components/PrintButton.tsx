"use client";

/**
 * 인쇄 버튼.
 *
 * 화면에 보이는 그대로가 아니라 보고용으로 정리된 모양으로 나간다
 * (메뉴·버튼·필터는 빠지고, 폰에서도 카드가 아니라 표로 찍힌다 — globals.css 의 @media print).
 */
export default function PrintButton({ label = "인쇄" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      title="보고용으로 인쇄 / PDF 저장"
    >
      🖨 {label}
    </button>
  );
}
