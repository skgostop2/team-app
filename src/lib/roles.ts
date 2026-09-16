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

/** 팀장이 이름·이메일만 미리 등록해 둔 상태 (본인 회원가입 전). 업무는 미리 배정할 수 있다. */
export function isPreRegistered(profile: Profile | null | undefined): boolean {
  return profile?.status === "가입대기";
}

/** 업무를 배정할 수 있는 사람 — 가입 완료된 사람 + 사전등록만 해둔 사람 */
export function isAssignable(profile: Profile | null | undefined): boolean {
  return profile?.status === "승인" || profile?.status === "가입대기";
}

/** 실장 > 팀장 > 팀원 순으로 정렬하기 위한 가중치 */
export function roleOrder(role: Role): number {
  if (role === "실장") return 0;
  if (role === "팀장") return 1;
  return 2;
}

/** 팀장이 정한 순서대로 정렬 (같으면 역할 → 이름 순) */
export function byDisplayOrder(a: Profile, b: Profile): number {
  const ao = a.sort_order ?? 1000;
  const bo = b.sort_order ?? 1000;
  if (ao !== bo) return ao - bo;
  const ro = roleOrder(a.role) - roleOrder(b.role);
  if (ro !== 0) return ro;
  return a.name.localeCompare(b.name);
}
