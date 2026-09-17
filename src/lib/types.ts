// 데이터베이스 테이블 타입 (수동 정의 - migration.sql 과 동기화 유지)

export type Role = "실장" | "팀장" | "팀원";
export type ProfileStatus = "대기" | "가입대기" | "승인" | "비활성" | "삭제";
export type TaskStatus = "대기" | "진행중" | "완료" | "지연";

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: ProfileStatus;
  team_name: string | null;
  position: string | null;
  created_at: string;
  last_seen_at: string;
  /** 팀장이 정한 표시 순서 */
  sort_order: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  created_by: string | null;
  /** 지시자 — 공장장·대표처럼 시스템에 계정이 없는 분도 적을 수 있어 자유 입력 */
  instructor: string | null;
  /** 비고 */
  note: string | null;
  /** 참여자 (담당 1명 + 참여자 여러 명) */
  deputy_ids: string[];
  /** 지시 = 팀장·실장이 지시한 업무, 팀원추가 = 팀원이 스스로 올린 업무 */
  source: "지시" | "팀원추가";
  start_date: string | null;
  due_date: string | null;
  progress: number;
  status: TaskStatus;
  confirmed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithEffectiveStatus extends Task {
  effective_status: TaskStatus;
  is_new: boolean;
  /** 지시일(작성일)부터 걸린 일수. 완료건은 실제 소요일수, 진행중이면 오늘까지 경과일수 */
  elapsed_days: number;
  /** 완료계획일 대비 일수. 양수=초과, 음수=앞당김, null=계획일 없음 */
  schedule_diff_days: number | null;
  /** 계획일을 넘긴 일수 (안 넘겼으면 0) */
  overdue_days: number;
  /** 기한 내 완료 여부. 완료 전이거나 계획일이 없으면 null */
  on_time: boolean | null;
}

export interface TaskHistory {
  id: string;
  task_id: string;
  changed_by: string | null;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  created_by: string | null;
  created_at: string;
}

export interface NoticeRead {
  id: string;
  notice_id: string;
  user_id: string;
  read_at: string;
}

export interface EvaluationPeriod {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
}

export interface EvaluationCriteria {
  id: string;
  name: string;
  weight: number;
  description: string | null;
  created_at: string;
}

// Supabase 클라이언트 제네릭용 최소 Database 타입
// (전체 스키마 자동생성 대신 사용 지점에서 위 인터페이스로 캐스팅)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;

/** 담당 인계 기록 — 담당자가 바뀌어도 기록은 남는다 */
export interface TaskAssigneeLog {
  id: string;
  task_id: string;
  prev_assignee_id: string | null;
  new_assignee_id: string | null;
  changed_by: string | null;
  changed_at: string;
}

/** 고과평가 기준 — 기준값은 팀장이 직접 정한다 */
export interface EvaluationCriterion {
  id: string;
  name: string;
  description: string | null;
  weight: number | null;
  /** 업무 기록에서 자동 산출되는 지표 키. 수기 항목이면 null */
  metric_key: "completion_rate" | "on_time_rate" | "avg_overdue" | "delayed_now" | null;
  target: number | null;
  /** gte = 이상이면 충족, lte = 이하면 충족 */
  comparator: "gte" | "lte" | null;
  unit: string;
  sort_order: number;
  enabled: boolean;
}

/** 개인 메모 — 본인만 볼 수 있다 (팀장·실장도 못 본다) */
export interface PersonalNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  pinned: boolean;
  /** 특정 업무에 붙여둔 메모면 그 업무 id */
  task_id: string | null;
  /** 휴지통에 들어간 시각. null 이면 보통 메모 */
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
