// 마지막 접속 등, 시간 경과를 "n분 전 / n시간 전 / n일 전" 형태로 표시
export function formatElapsed(dateString: string | null | undefined): string {
  if (!dateString) return "기록 없음";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 30) return `${diffDay}일 전`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}개월 전`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear}년 전`;
}

// 장기 미접속 여부 (3일 이상 미접속 시 표시 강조)
export function isLongInactive(dateString: string | null | undefined, days = 3): boolean {
  if (!dateString) return true;
  const date = new Date(dateString);
  const now = new Date();
  const diffDay = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDay >= days;
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  const d = new Date(dateString);
  return `${formatDate(dateString)} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// 표에서 쓰는 짧은 날짜 (메모 양식처럼 6/10 형태)
export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 작성일 칼럼용 (2026-06-04 형태)
export function formatIsoDate(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
