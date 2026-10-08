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

/** 그룹장 — 자기 그룹 팀원에게만 업무를 지시·분배한다 */
export function isGroupLead(profile: Profile | null | undefined): boolean {
  return profile?.role === "그룹장" && profile?.status === "승인";
}

/**
 * 업무를 지시·분배할 수 있는 사람.
 * 팀장·실장은 전부, 그룹장은 자기 그룹만 (대상은 assignableBy 가 추린다).
 */
export function canDirect(profile: Profile | null | undefined): boolean {
  return isManager(profile) || isGroupLead(profile);
}

/**
 * 이 사람이 업무를 맡길 수 있는 대상.
 *
 * 그룹장은 자기 그룹 사람만 고를 수 있다. 서버(RLS)에서도 같은 규칙으로 막으니
 * 화면에서 안 보이는 사람에게 억지로 넘기려 해도 저장이 안 된다.
 */
export function assignableBy(
  me: Profile | null | undefined,
  everyone: Profile[]
): Profile[] {
  const pool = everyone.filter(isAssignable);
  if (isManager(me)) return pool;
  if (isGroupLead(me)) {
    return pool.filter((p) => (me!.group_id && p.group_id === me!.group_id) || p.id === me!.id);
  }
  return [];
}

/** 실장 > 팀장 > 그룹장 > 팀원 순으로 정렬하기 위한 가중치 */
export function roleOrder(role: Role): number {
  if (role === "실장") return 0;
  if (role === "팀장") return 1;
  if (role === "그룹장") return 2;
  return 3;
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
