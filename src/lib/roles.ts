import type { Profile, Role } from "./types";

/** 실장·팀장 — 업무 지시, 팀원 관리, 공지 등록 등 운영 권한을 가진 사람 */
export function isManager(profile: Profile | null | undefined): boolean {
  return profile?.role === "팀장" || profile?.role === "실장";
}

/** 팀장 — 고과평가는 팀장 전용 */
export function isTeamLead(profile: Profile | null | undefined): boolean {
  return profile?.role === "팀장";
}

export function isDirector(profile: Profile | null | undefined): boolean {
  return profile?.role === "실장";
}

/** 실장 > 팀장 > 팀원 순으로 정렬하기 위한 가중치 */
export function roleOrder(role: Role): number {
  if (role === "실장") return 0;
  if (role === "팀장") return 1;
  return 2;
}
