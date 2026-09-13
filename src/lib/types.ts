// 데이터베이스 테이블 타입 (수동 정의 - migration.sql 과 동기화 유지)

export type Role = "실장" | "팀장" | "팀원";
export type ProfileStatus = "대기" | "승인" | "비활성" | "삭제";
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
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  created_by: string | null;
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
