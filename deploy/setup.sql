-- ============================================================================
--  팀원 업무관리 시스템 — 새 팀 설치 파일
--
--  이 파일 하나를 새 Supabase 프로젝트의 SQL Editor 에 붙여넣고 실행하면
--  빈 상태의 업무관리 시스템이 만들어진다.
--
--  팀마다 DB 를 따로 둔다 (한 DB 에 여러 팀을 담지 않는다).
--  팀 사이에 자료가 섞일 길을 아예 없애기 위함이다.
--
--  실행 순서
--    1) 새 Supabase 프로젝트를 만든다
--    2) SQL Editor 에 이 파일을 붙여넣고 Run
--    3) Edge Function 세 개를 올린다 (아래 「서버 함수」 참고)
--    4) Vercel 에 주소를 연결한다 (환경변수 두 개)
--    5) 첫 팀장 계정을 만든다 (아래 「첫 팀장」 참고)
--
--  생성일 기준: 2026-10-23 (생기팀 운영본에서 추출)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 1. 표
-- ─────────────────────────────────────────────────────────────

create table if not exists public.groups (
  id uuid default gen_random_uuid() not null,
  name text not null,
  sort_order integer default 1000 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.profiles (
  id uuid not null,
  email text not null,
  name text default ''::text not null,
  role text default '팀원'::text not null,
  status text default '승인'::text not null,
  team_name text,
  position text,
  created_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  sort_order integer default 1000 not null,
  mfa_enabled boolean default false not null,
  password_changed boolean default false not null,
  group_id uuid
);

create table if not exists public.assign_batches (
  id uuid default gen_random_uuid() not null,
  content text not null,
  memo text,
  created_by uuid,
  task_count integer default 0 not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.tasks (
  id uuid default gen_random_uuid() not null,
  title text not null,
  description text,
  assignee_id uuid,
  created_by uuid,
  start_date date,
  due_date date,
  progress integer default 0 not null,
  status text default '대기'::text not null,
  confirmed_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  instructor text,
  note text,
  deputy_ids uuid[] default '{}'::uuid[] not null,
  source text default '지시'::text not null,
  batch_id uuid,
  lead_ack_at timestamp with time zone,
  lead_ack_by uuid,
  urgent boolean default false not null
);

create table if not exists public.task_items (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  idx integer default 0 not null,
  text text not null,
  done boolean default false not null,
  done_at timestamp with time zone,
  done_by uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.task_updates (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  author_id uuid,
  content text not null,
  progress_from integer,
  progress_to integer,
  created_at timestamp with time zone default now() not null,
  edited_at timestamp with time zone,
  kind text default '기록'::text not null,
  reply_to uuid,
  answered_at timestamp with time zone
);

create table if not exists public.task_history (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  changed_by uuid,
  field_name text not null,
  old_value text,
  new_value text,
  changed_at timestamp with time zone default now() not null
);

create table if not exists public.task_assignee_log (
  id uuid default gen_random_uuid() not null,
  task_id uuid not null,
  prev_assignee_id uuid,
  new_assignee_id uuid,
  changed_by uuid,
  changed_at timestamp with time zone default now() not null
);

create table if not exists public.task_stars (
  task_id uuid not null,
  user_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.deleted_tasks (
  id uuid not null,
  title text,
  assignee_name text,
  instructor text,
  status text,
  progress integer,
  created_at timestamp with time zone,
  snapshot jsonb not null,
  history_count integer default 0 not null,
  update_count integer default 0 not null,
  deleted_by uuid,
  deleted_at timestamp with time zone default now() not null
);

create table if not exists public.notices (
  id uuid default gen_random_uuid() not null,
  title text not null,
  content text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  kind text default '공지' not null check (kind in ('공지','공유')),
  popup boolean default true not null
);

create table if not exists public.notice_reads (
  id uuid default gen_random_uuid() not null,
  notice_id uuid not null,
  user_id uuid not null,
  read_at timestamp with time zone default now() not null
);

create table if not exists public.personal_notes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text default ''::text not null,
  content text default ''::text not null,
  pinned boolean default false not null,
  task_id uuid,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.evaluation_criteria (
  id uuid default gen_random_uuid() not null,
  name text not null,
  weight numeric default 0 not null,
  description text,
  created_at timestamp with time zone default now() not null,
  metric_key text,
  target numeric,
  comparator text,
  unit text default ''::text not null,
  sort_order integer default 100 not null,
  enabled boolean default true not null
);

create table if not exists public.evaluation_periods (
  id uuid default gen_random_uuid() not null,
  name text not null,
  start_date date,
  end_date date,
  status text default '준비중'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.evaluation_scores (
  id uuid default gen_random_uuid() not null,
  period_id uuid,
  user_id uuid,
  criteria_id uuid,
  score numeric,
  note text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.team_settings (
  key text not null,
  value boolean default false not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.delete_lock (
  id boolean default true not null,
  password_sha256 text not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.trusted_devices (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  token_hash text not null,
  label text,
  created_at timestamp with time zone default now() not null,
  last_used_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null
);

-- ─────────────────────────────────────────────────────────────
-- 2. 키와 제약
-- ─────────────────────────────────────────────────────────────

alter table public.groups add constraint groups_pkey primary key (id);

alter table public.profiles add constraint profiles_pkey primary key (id);
alter table public.profiles add constraint profiles_group_id_fkey foreign key (group_id) references groups(id) on delete set null;
alter table public.profiles add constraint profiles_role_check check ((role = any (array['실장'::text, '팀장'::text, '그룹장'::text, '팀원'::text])));
alter table public.profiles add constraint profiles_status_check check ((status = any (array['대기'::text, '가입대기'::text, '승인'::text, '비활성'::text, '삭제'::text])));

alter table public.assign_batches add constraint assign_batches_pkey primary key (id);
alter table public.assign_batches add constraint assign_batches_created_by_fkey foreign key (created_by) references profiles(id) on delete set null;

alter table public.tasks add constraint tasks_pkey primary key (id);
alter table public.tasks add constraint tasks_assignee_id_fkey foreign key (assignee_id) references profiles(id);
alter table public.tasks add constraint tasks_batch_id_fkey foreign key (batch_id) references assign_batches(id) on delete set null;
alter table public.tasks add constraint tasks_created_by_fkey foreign key (created_by) references profiles(id);
alter table public.tasks add constraint tasks_lead_ack_by_fkey foreign key (lead_ack_by) references profiles(id) on delete set null;
alter table public.tasks add constraint tasks_progress_check check (((progress >= 0) and (progress <= 100)));
alter table public.tasks add constraint tasks_source_check check ((source = any (array['지시'::text, '팀원추가'::text])));
alter table public.tasks add constraint tasks_status_check check ((status = any (array['대기'::text, '진행중'::text, '완료'::text, '지연'::text])));

alter table public.task_items add constraint task_items_pkey primary key (id);
alter table public.task_items add constraint task_items_done_by_fkey foreign key (done_by) references profiles(id) on delete set null;
alter table public.task_items add constraint task_items_task_id_fkey foreign key (task_id) references tasks(id) on delete cascade;

alter table public.task_updates add constraint task_updates_pkey primary key (id);
alter table public.task_updates add constraint task_updates_author_id_fkey foreign key (author_id) references profiles(id);
alter table public.task_updates add constraint task_updates_reply_to_fkey foreign key (reply_to) references task_updates(id) on delete set null;
alter table public.task_updates add constraint task_updates_task_id_fkey foreign key (task_id) references tasks(id) on delete cascade;
alter table public.task_updates add constraint task_updates_kind_check check ((kind = any (array['기록'::text, '질문'::text, '답변'::text])));

alter table public.task_history add constraint task_history_pkey primary key (id);
alter table public.task_history add constraint task_history_changed_by_fkey foreign key (changed_by) references profiles(id);
alter table public.task_history add constraint task_history_task_id_fkey foreign key (task_id) references tasks(id) on delete cascade;

alter table public.task_assignee_log add constraint task_assignee_log_pkey primary key (id);
alter table public.task_assignee_log add constraint task_assignee_log_changed_by_fkey foreign key (changed_by) references profiles(id);
alter table public.task_assignee_log add constraint task_assignee_log_new_assignee_id_fkey foreign key (new_assignee_id) references profiles(id);
alter table public.task_assignee_log add constraint task_assignee_log_prev_assignee_id_fkey foreign key (prev_assignee_id) references profiles(id);
alter table public.task_assignee_log add constraint task_assignee_log_task_id_fkey foreign key (task_id) references tasks(id) on delete cascade;

alter table public.task_stars add constraint task_stars_pkey primary key (task_id, user_id);
alter table public.task_stars add constraint task_stars_task_id_fkey foreign key (task_id) references tasks(id) on delete cascade;
alter table public.task_stars add constraint task_stars_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table public.deleted_tasks add constraint deleted_tasks_pkey primary key (id);
alter table public.deleted_tasks add constraint deleted_tasks_deleted_by_fkey foreign key (deleted_by) references profiles(id) on delete set null;

alter table public.notices add constraint notices_pkey primary key (id);
alter table public.notices add constraint notices_created_by_fkey foreign key (created_by) references profiles(id);

alter table public.notice_reads add constraint notice_reads_pkey primary key (id);
alter table public.notice_reads add constraint notice_reads_notice_id_user_id_key unique (notice_id, user_id);
alter table public.notice_reads add constraint notice_reads_notice_id_fkey foreign key (notice_id) references notices(id) on delete cascade;
alter table public.notice_reads add constraint notice_reads_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table public.personal_notes add constraint personal_notes_pkey primary key (id);
alter table public.personal_notes add constraint personal_notes_task_id_fkey foreign key (task_id) references tasks(id) on delete set null;
alter table public.personal_notes add constraint personal_notes_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table public.evaluation_criteria add constraint evaluation_criteria_pkey primary key (id);
alter table public.evaluation_criteria add constraint evaluation_criteria_comparator_check check (((comparator is null) or (comparator = any (array['gte'::text, 'lte'::text]))));

alter table public.evaluation_periods add constraint evaluation_periods_pkey primary key (id);

alter table public.evaluation_scores add constraint evaluation_scores_pkey primary key (id);
alter table public.evaluation_scores add constraint evaluation_scores_criteria_id_fkey foreign key (criteria_id) references evaluation_criteria(id) on delete cascade;
alter table public.evaluation_scores add constraint evaluation_scores_period_id_fkey foreign key (period_id) references evaluation_periods(id) on delete cascade;
alter table public.evaluation_scores add constraint evaluation_scores_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table public.team_settings add constraint team_settings_pkey primary key (key);

alter table public.delete_lock add constraint delete_lock_pkey primary key (id);
alter table public.delete_lock add constraint delete_lock_updated_by_fkey foreign key (updated_by) references profiles(id) on delete set null;
alter table public.delete_lock add constraint delete_lock_id_check check (id);

alter table public.trusted_devices add constraint trusted_devices_pkey primary key (id);
alter table public.trusted_devices add constraint trusted_devices_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

-- 팀장은 한 팀에 한 사람
create unique index if not exists one_team_lead_only on public.profiles using btree (role) where (role = '팀장'::text);

create index if not exists assign_batches_created_at_idx on public.assign_batches using btree (created_at desc);
create unique index if not exists evaluation_criteria_metric_key_idx on public.evaluation_criteria using btree (metric_key) where (metric_key is not null);
create index if not exists personal_notes_user_idx on public.personal_notes using btree (user_id, pinned desc, updated_at desc);
create index if not exists profiles_group_id_idx on public.profiles using btree (group_id);
create index if not exists task_assignee_log_new_idx on public.task_assignee_log using btree (new_assignee_id);
create index if not exists task_assignee_log_prev_idx on public.task_assignee_log using btree (prev_assignee_id);
create index if not exists task_assignee_log_task_idx on public.task_assignee_log using btree (task_id);
create index if not exists task_items_task_idx on public.task_items using btree (task_id, idx);
create index if not exists task_stars_user_idx on public.task_stars using btree (user_id);
create index if not exists task_updates_kind_idx on public.task_updates using btree (task_id, kind);
create index if not exists task_updates_task_idx on public.task_updates using btree (task_id, created_at desc);
create index if not exists tasks_batch_id_idx on public.tasks using btree (batch_id);
create unique index if not exists trusted_devices_hash_idx on public.trusted_devices using btree (token_hash);
create index if not exists trusted_devices_user_idx on public.trusted_devices using btree (user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. 누가 무엇을 할 수 있는지 판단하는 함수
--    (RLS 규칙이 이 함수들을 불러 쓴다)
-- ─────────────────────────────────────────────────────────────

create or replace function public.is_approved(uid uuid)
 returns boolean language sql security definer set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where id = uid and status = '승인');
$function$;

create or replace function public.is_manager(uid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = uid and role in ('실장','팀장') and status = '승인'
  );
$function$;

create or replace function public.is_team_lead(uid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = uid and role = '팀장' and status = '승인'
  );
$function$;

create or replace function public.is_group_lead(uid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles
    where id = uid and role = '그룹장' and status = '승인'
  );
$function$;

create or replace function public.lead_exists()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (select 1 from public.profiles where role = '팀장');
$function$;

create or replace function public.group_of(uid uuid)
 returns uuid language sql stable security definer set search_path to 'public'
as $function$
  select group_id from public.profiles where id = uid;
$function$;

create or replace function public.same_group(a uuid, b uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select
    a is not null and b is not null
    and public.group_of(a) is not null
    and public.group_of(a) = public.group_of(b);
$function$;

-- 그룹장이 그 사람을 맡고 있는가
create or replace function public.manages_user(leader uuid, target uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select
    leader is not null
    and target is not null
    and public.is_group_lead(leader)
    and (
      target = leader
      or exists (
        select 1 from public.profiles p
        where p.id = target
          and p.group_id is not null
          and p.group_id = public.group_of(leader)
      )
    );
$function$;

-- 그룹장이 그 업무를 맡고 있는가 (담당자나 참여자가 자기 그룹 사람인가)
create or replace function public.manages_task(leader uuid, task_assignee uuid, task_deputies uuid[])
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select
    public.is_group_lead(leader)
    and (
      public.manages_user(leader, task_assignee)
      or exists (
        select 1 from unnest(coalesce(task_deputies, '{}'::uuid[])) d
        where public.manages_user(leader, d)
      )
    );
$function$;

-- 예전에 이 업무의 담당이었는가 (담당이 바뀌어도 기록이 사라지지 않게)
create or replace function public.was_assignee(uid uuid, tid uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.task_assignee_log l
    where l.task_id = tid and l.prev_assignee_id = uid
  );
$function$;

-- 팀장이 「팀 현황 공개」를 켜 두었는가
create or replace function public.progress_shared()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select coalesce(
    (select value from public.team_settings where key = 'share_progress_with_members'),
    false
  );
$function$;

-- 화면을 열 때 마지막 접속 시각을 남긴다 (하루 한 번만 부른다)
create or replace function public.touch_last_seen()
 returns void language sql security definer set search_path to 'public'
as $function$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$function$;

-- 함수 실행 권한 — 로그인한 사람만. 로그인 전 화면에서 필요한 lead_exists 만 예외.
revoke execute on function public.is_approved(uuid) from public, anon;
revoke execute on function public.is_manager(uuid) from public, anon;
revoke execute on function public.is_team_lead(uuid) from public, anon;
revoke execute on function public.is_group_lead(uuid) from public, anon;
revoke execute on function public.group_of(uuid) from public, anon;
revoke execute on function public.same_group(uuid, uuid) from public, anon;
revoke execute on function public.manages_user(uuid, uuid) from public, anon;
revoke execute on function public.manages_task(uuid, uuid, uuid[]) from public, anon;
revoke execute on function public.was_assignee(uuid, uuid) from public, anon;
revoke execute on function public.progress_shared() from public, anon;
revoke execute on function public.touch_last_seen() from public, anon;

grant execute on function public.is_approved(uuid) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.is_team_lead(uuid) to authenticated;
grant execute on function public.is_group_lead(uuid) to authenticated;
grant execute on function public.group_of(uuid) to authenticated;
grant execute on function public.same_group(uuid, uuid) to authenticated;
grant execute on function public.manages_user(uuid, uuid) to authenticated;
grant execute on function public.manages_task(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.was_assignee(uuid, uuid) to authenticated;
grant execute on function public.progress_shared() to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.lead_exists() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. 지킴이·기록 (트리거 함수)
-- ─────────────────────────────────────────────────────────────

-- 가입하면 프로필을 만든다 (auth.users → profiles)
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 권한·소속·상태는 팀장·실장만 바꿀 수 있다
create or replace function public.profiles_guard()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if current_user = 'service_role'
     or coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role' then
    return new;
  end if;

  if public.is_manager(auth.uid()) then
    return new;
  end if;

  if new.id <> old.id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.position is distinct from old.position
     or new.group_id is distinct from old.group_id
     or new.sort_order is distinct from old.sort_order then
    raise exception '권한이 없습니다 (권한·소속·상태는 팀장·실장만 바꿀 수 있습니다)';
  end if;

  return new;
end;
$function$;

-- 업무를 누가 어디까지 고칠 수 있는지
create or replace function public.tasks_guard()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  involved boolean;
  group_lead boolean;
begin
  -- 서버(Edge Function)가 하는 일은 통과시킨다
  if current_user = 'service_role'
     or coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role' then
    return new;
  end if;

  if public.is_manager(auth.uid()) then
    return new;
  end if;

  if new.lead_ack_at is distinct from old.lead_ack_at
     or new.lead_ack_by is distinct from old.lead_ack_by then
    raise exception '권한이 없습니다 (확인 표시는 팀장·실장만 할 수 있습니다)';
  end if;

  group_lead := public.manages_task(auth.uid(), old.assignee_id, old.deputy_ids);

  -- 긴급은 업무를 주는 사람이 단다
  if new.urgent is distinct from old.urgent and not group_lead then
    raise exception '권한이 없습니다 (긴급 표시는 팀장·실장·그룹장만 할 수 있습니다)';
  end if;

  if new.source is distinct from old.source then
    raise exception '권한이 없습니다 (업무 구분은 바꿀 수 없습니다)';
  end if;

  if new.created_by is distinct from old.created_by
     or (new.instructor is distinct from old.instructor and not group_lead) then
    raise exception '권한이 없습니다 (지시자는 팀장·실장만 바꿀 수 있습니다)';
  end if;

  involved := (
    old.assignee_id = auth.uid()
    or auth.uid() = any(coalesce(old.deputy_ids, '{}'::uuid[]))
    or (old.source = '팀원추가' and old.created_by = auth.uid())
  );

  if not involved and not group_lead then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.start_date is distinct from old.start_date
       or new.due_date is distinct from old.due_date
       or new.assignee_id is distinct from old.assignee_id
       or new.deputy_ids is distinct from old.deputy_ids then
      raise exception '권한이 없습니다 (담당자만 이 업무를 고칠 수 있습니다)';
    end if;
  end if;

  if group_lead and not involved
     and new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is not null
     and not public.manages_user(auth.uid(), new.assignee_id) then
    raise exception '권한이 없습니다 (자기 그룹 팀원에게만 넘길 수 있습니다)';
  end if;

  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    if not exists (select 1 from public.profiles where id = new.assignee_id and status = '승인') then
      raise exception '승인된 팀원에게만 담당을 넘길 수 있습니다';
    end if;
  end if;

  return new;
end;
$function$;

-- 지시인지 팀원이 스스로 올린 것인지 (사람이 바꿀 수 없다)
create or replace function public.tasks_set_source()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if public.is_manager(auth.uid()) then
    new.source := '지시';
  else
    new.source := '팀원추가';
  end if;
  return new;
end;
$function$;

-- 팀장이 올린 업무는 「신규」 표시를 바로 지운다
create or replace function public.tasks_mark_new()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.lead_ack_at is null and public.is_manager(new.created_by) then
    new.lead_ack_at := now();
    new.lead_ack_by := new.created_by;
  end if;
  return new;
end;
$function$;

-- 고친 내용을 모두 이력에 남긴다
create or replace function public.tasks_audit()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  new.updated_at := now();

  if new.status = '완료' then
    if new.completed_at is null then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;

  if old.title is distinct from new.title then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'title', old.title, new.title);
  end if;
  if old.description is distinct from new.description then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'description', old.description, new.description);
  end if;
  if old.assignee_id is distinct from new.assignee_id then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'assignee_id',
      (select name from public.profiles where id = old.assignee_id),
      (select name from public.profiles where id = new.assignee_id));
  end if;
  if old.deputy_ids is distinct from new.deputy_ids then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'deputy_ids',
      (select string_agg(name, ', ' order by name) from public.profiles where id = any(old.deputy_ids)),
      (select string_agg(name, ', ' order by name) from public.profiles where id = any(new.deputy_ids)));
  end if;
  if old.instructor is distinct from new.instructor then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'instructor', old.instructor, new.instructor);
  end if;
  if old.note is distinct from new.note then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'note', old.note, new.note);
  end if;
  if old.start_date is distinct from new.start_date then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'start_date', old.start_date::text, new.start_date::text);
  end if;
  if old.due_date is distinct from new.due_date then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'due_date', old.due_date::text, new.due_date::text);
  end if;
  if old.completed_at is distinct from new.completed_at then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'completed_at',
      to_char(old.completed_at, 'YYYY-MM-DD'), to_char(new.completed_at, 'YYYY-MM-DD'));
  end if;
  if old.progress is distinct from new.progress then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'progress', old.progress::text, new.progress::text);
  end if;
  if old.status is distinct from new.status then
    insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
    values (new.id, auth.uid(), 'status', old.status, new.status);
  end if;

  return new;
end;
$function$;

create or replace function public.tasks_audit_insert()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.task_history(task_id, changed_by, field_name, old_value, new_value)
  values (new.id, auth.uid(), 'created', null, new.title);
  return new;
end;
$function$;

-- 담당이 바뀐 기록 (예전 담당자 화면에서 업무가 사라지지 않게)
create or replace function public.tasks_log_assignee()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if old.assignee_id is distinct from new.assignee_id then
    insert into public.task_assignee_log(task_id, prev_assignee_id, new_assignee_id, changed_by)
    values (new.id, old.assignee_id, new.assignee_id, auth.uid());
  end if;
  return new;
end;
$function$;

-- 지워도 누가 언제 무엇을 지웠는지 남긴다
create or replace function public.tasks_tombstone()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  insert into public.deleted_tasks (
    id, title, assignee_name, instructor, status, progress, created_at,
    snapshot, history_count, update_count, deleted_by
  )
  values (
    old.id, old.title,
    (select name from public.profiles where id = old.assignee_id),
    old.instructor, old.status, old.progress, old.created_at,
    to_jsonb(old),
    (select count(*) from public.task_history where task_id = old.id),
    (select count(*) from public.task_updates where task_id = old.id),
    auth.uid()
  )
  on conflict (id) do nothing;
  return old;
end;
$function$;

-- 세부 항목을 체크하면 진행률을 다시 센다 (화면과 어긋나지 않게 서버에서 계산)
create or replace function public.task_items_sync_progress()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  tid uuid := coalesce(new.task_id, old.task_id);
  total int;
  fin int;
  pct int;
begin
  select count(*), count(*) filter (where done) into total, fin
  from public.task_items where task_id = tid;

  if total = 0 then
    return coalesce(new, old);
  end if;

  pct := round(fin::numeric * 100 / total);

  -- 100% 여도 완료로 바꾸지 않는다 — 완료 처리는 사람이 누른다
  update public.tasks t
     set progress = pct,
         status = case
                    when pct >= 100 then t.status
                    when pct > 0 then '진행중'
                    else '대기'
                  end
   where t.id = tid
     and (t.progress is distinct from pct or (pct < 100 and t.status = '완료'));

  return coalesce(new, old);
end;
$function$;

create or replace function public.task_updates_touch()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end $function$;

create or replace function public.personal_notes_touch()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  new.updated_at := now();
  return new;
end $function$;

-- 트리거 걸기
create or replace trigger trg_profiles_guard before update on public.profiles for each row execute function profiles_guard();
create or replace trigger tasks_mark_new_trg before insert on public.tasks for each row execute function tasks_mark_new();
create or replace trigger trg_tasks_set_source before insert on public.tasks for each row execute function tasks_set_source();
create or replace trigger trg_tasks_guard before update on public.tasks for each row execute function tasks_guard();
create or replace trigger trg_tasks_audit before update on public.tasks for each row execute function tasks_audit();
create or replace trigger trg_tasks_audit_insert after insert on public.tasks for each row execute function tasks_audit_insert();
create or replace trigger trg_tasks_log_assignee after update of assignee_id on public.tasks for each row execute function tasks_log_assignee();
create or replace trigger trg_tasks_tombstone before delete on public.tasks for each row execute function tasks_tombstone();
create or replace trigger trg_task_items_progress after insert or delete or update on public.task_items for each row execute function task_items_sync_progress();

create or replace trigger trg_task_updates_touch before update on public.task_updates for each row execute function task_updates_touch();
create or replace trigger trg_personal_notes_touch before update on public.personal_notes for each row execute function personal_notes_touch();

-- ─────────────────────────────────────────────────────────────
-- 5. 보는 눈 (뷰) — 화면이 쓰는 계산값
-- ─────────────────────────────────────────────────────────────

create or replace view public.v_tasks with (security_invoker = true) as
 SELECT t.id, t.title, t.description, t.assignee_id, t.created_by, t.start_date, t.due_date, t.progress, t.status,
    t.confirmed_at, t.completed_at, t.created_at, t.updated_at, t.instructor, t.note, t.deputy_ids, t.source,
    COALESCE(t.completed_at::date, CURRENT_DATE) - t.created_at::date AS elapsed_days,
    CASE WHEN t.due_date IS NULL THEN NULL::integer ELSE COALESCE(t.completed_at::date, CURRENT_DATE) - t.due_date END AS schedule_diff_days,
    CASE WHEN t.due_date IS NULL THEN 0 ELSE GREATEST(0, COALESCE(t.completed_at::date, CURRENT_DATE) - t.due_date) END AS overdue_days,
    CASE WHEN t.completed_at IS NULL OR t.due_date IS NULL THEN NULL::boolean ELSE t.completed_at::date <= t.due_date END AS on_time,
    CASE WHEN t.status <> '완료' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE THEN '지연' ELSE t.status END AS effective_status,
    t.confirmed_at IS NULL AS is_new,
    u.cnt AS update_count, u.last_at AS last_update_at, u.last_text AS last_update_text, u.last_by AS last_update_by,
    t.urgent,
    -- 마지막으로 무엇이든 움직인 때: 업무 수정·진행기록·항목 체크 중 가장 최근
    GREATEST(t.updated_at, t.created_at, u.last_at, i.last_done) AS last_activity_at,
    -- 정체: 끝나지 않았고 7일 넘게 아무것도 안 움직임
    (t.status <> '완료' AND GREATEST(t.updated_at, t.created_at, u.last_at, i.last_done) < now() - interval '7 days') AS stalled
   FROM tasks t
     LEFT JOIN LATERAL ( SELECT count(*) AS cnt, max(tu.created_at) AS last_at,
            (array_agg(tu.content ORDER BY tu.created_at DESC))[1] AS last_text,
            (array_agg(p.name ORDER BY tu.created_at DESC))[1] AS last_by
           FROM task_updates tu LEFT JOIN profiles p ON p.id = tu.author_id
          WHERE tu.task_id = t.id AND COALESCE(tu.kind, '기록') = '기록') u ON true
     LEFT JOIN LATERAL ( SELECT max(ti.done_at) AS last_done FROM task_items ti WHERE ti.task_id = t.id ) i ON true;

-- ─────────────────────────────────────────────────────────────
-- 6. 잠금 (RLS) — 누가 무엇을 볼 수 있는지
--    화면을 우회해도 여기서 막힌다
-- ─────────────────────────────────────────────────────────────

alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.assign_batches enable row level security;
alter table public.tasks enable row level security;
alter table public.task_items enable row level security;
alter table public.task_updates enable row level security;
alter table public.task_history enable row level security;
alter table public.task_assignee_log enable row level security;
alter table public.task_stars enable row level security;
alter table public.deleted_tasks enable row level security;
alter table public.notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.personal_notes enable row level security;
alter table public.evaluation_criteria enable row level security;
alter table public.evaluation_periods enable row level security;
alter table public.evaluation_scores enable row level security;
alter table public.team_settings enable row level security;
alter table public.delete_lock enable row level security;
alter table public.trusted_devices enable row level security;

create policy groups_select on public.groups for select using (is_approved(auth.uid()));
create policy groups_insert on public.groups for insert with check (is_manager(auth.uid()));
create policy groups_update on public.groups for update using (is_manager(auth.uid())) with check (is_manager(auth.uid()));
create policy groups_delete on public.groups for delete using (is_team_lead(auth.uid()));

-- 이름·소속은 담당자 표시에 필요해 열어 둔다. 업무·평가는 아래에서 따로 막는다.
create policy profiles_select_all on public.profiles for select using ((auth.uid() is not null));
create policy profiles_update on public.profiles for update using (((auth.uid() = id) or is_manager(auth.uid())));

create policy assign_batches_select on public.assign_batches for select using (is_manager(auth.uid()));
create policy assign_batches_insert on public.assign_batches for insert with check ((is_manager(auth.uid()) and (created_by = auth.uid())));
create policy assign_batches_update on public.assign_batches for update using ((is_manager(auth.uid()) and (created_by = auth.uid())));

-- 팀원은 자기 업무 + 참여한 업무 + 예전에 맡았던 업무만.
-- 팀장이 「팀 현황 공개」를 켜면 같은 그룹 사람 것까지 보인다.
create policy tasks_select on public.tasks for select
  using ((is_manager(auth.uid()) or manages_task(auth.uid(), assignee_id, deputy_ids)
    or (is_approved(auth.uid()) and ((assignee_id = auth.uid()) or (auth.uid() = any (deputy_ids))
      or was_assignee(auth.uid(), id) or (progress_shared() and same_group(auth.uid(), assignee_id))))));
create policy tasks_insert on public.tasks for insert
  with check ((is_manager(auth.uid()) or manages_task(auth.uid(), assignee_id, deputy_ids)
    or (is_approved(auth.uid()) and (assignee_id = auth.uid()))));
create policy tasks_update on public.tasks for update
  using ((is_manager(auth.uid()) or manages_task(auth.uid(), assignee_id, deputy_ids)
    or (assignee_id = auth.uid()) or (auth.uid() = any (deputy_ids))))
  with check (true);
-- 지시받은 업무는 팀장만 지운다. 팀원은 자기가 올린 것만.
create policy tasks_delete on public.tasks for delete
  using ((is_team_lead(auth.uid())
    or (is_approved(auth.uid()) and (created_by = auth.uid()) and (source = '팀원추가'::text))));

create policy task_items_select on public.task_items for select
  using ((exists ( select 1 from tasks t where (t.id = task_items.task_id))));
create policy task_items_write on public.task_items for all
  using ((exists ( select 1 from tasks t
    where ((t.id = task_items.task_id) and (is_manager(auth.uid()) or manages_task(auth.uid(), t.assignee_id, t.deputy_ids)
      or (t.assignee_id = auth.uid()) or (auth.uid() = any (t.deputy_ids))
      or ((t.source = '팀원추가'::text) and (t.created_by = auth.uid())))))))
  with check ((exists ( select 1 from tasks t
    where ((t.id = task_items.task_id) and (is_manager(auth.uid()) or manages_task(auth.uid(), t.assignee_id, t.deputy_ids)
      or (t.assignee_id = auth.uid()) or (auth.uid() = any (t.deputy_ids))
      or ((t.source = '팀원추가'::text) and (t.created_by = auth.uid()))))))); 

create policy task_updates_select on public.task_updates for select
  using ((exists ( select 1 from tasks t where (t.id = task_updates.task_id))));
create policy task_updates_insert on public.task_updates for insert
  with check (((author_id = auth.uid()) and (exists ( select 1 from tasks t
    where ((t.id = task_updates.task_id) and (is_manager(auth.uid()) or manages_task(auth.uid(), t.assignee_id, t.deputy_ids)
      or (t.assignee_id = auth.uid()) or (auth.uid() = any (t.deputy_ids))))))));
create policy task_updates_update on public.task_updates for update using ((author_id = auth.uid()));

create policy task_history_select on public.task_history for select
  -- 업무가 보이는 사람은 그 업무의 변경이력도 본다 (그룹장·참여자 포함)
  using ((is_manager(auth.uid()) or (exists ( select 1 from tasks t where t.id = task_history.task_id))));

create policy task_assignee_log_select on public.task_assignee_log for select
  using ((is_manager(auth.uid()) or (prev_assignee_id = auth.uid()) or (new_assignee_id = auth.uid())
    or manages_user(auth.uid(), prev_assignee_id) or manages_user(auth.uid(), new_assignee_id)));

-- 별표는 사람마다 따로 — 남의 별표는 보이지 않는다
create policy task_stars_select on public.task_stars for select using ((user_id = auth.uid()));
create policy task_stars_insert on public.task_stars for insert with check ((user_id = auth.uid()));
create policy task_stars_delete on public.task_stars for delete using ((user_id = auth.uid()));

create policy deleted_tasks_select on public.deleted_tasks for select using (is_manager(auth.uid()));

create policy notices_select on public.notices for select using (is_approved(auth.uid()));
create policy notices_insert on public.notices for insert with check (
  created_by = auth.uid()
  and ((is_manager(auth.uid()) and kind in ('공지','공유'))
       or (is_approved(auth.uid()) and kind = '공유'))
);
create policy notices_update on public.notices for update using (is_manager(auth.uid()) or created_by = auth.uid());
create policy notices_delete on public.notices for delete using (is_manager(auth.uid()) or created_by = auth.uid());
create policy notice_reads_select on public.notice_reads for select using (((user_id = auth.uid()) or is_manager(auth.uid())));
create policy notice_reads_insert on public.notice_reads for insert with check ((user_id = auth.uid()));

-- 개인 메모장은 본인만 (팀장도 못 본다)
create policy personal_notes_select on public.personal_notes for select using ((user_id = auth.uid()));
create policy personal_notes_insert on public.personal_notes for insert with check ((user_id = auth.uid()));
create policy personal_notes_update on public.personal_notes for update using ((user_id = auth.uid()));
create policy personal_notes_delete on public.personal_notes for delete using ((user_id = auth.uid()));

create policy eval_criteria_all on public.evaluation_criteria for all using (is_team_lead(auth.uid())) with check (is_team_lead(auth.uid()));
create policy eval_periods_all on public.evaluation_periods for all using (is_team_lead(auth.uid())) with check (is_team_lead(auth.uid()));
create policy eval_scores_all on public.evaluation_scores for all using (is_team_lead(auth.uid())) with check (is_team_lead(auth.uid()));

create policy team_settings_select on public.team_settings for select using ((auth.uid() is not null));
create policy team_settings_insert on public.team_settings for insert with check (is_manager(auth.uid()));
-- 「팀 현황 공개」는 팀장만 바꾼다
create policy team_settings_update on public.team_settings for update
  using ((is_manager(auth.uid()) and ((key <> 'share_progress_with_members'::text) or is_team_lead(auth.uid()))))
  with check ((is_manager(auth.uid()) and ((key <> 'share_progress_with_members'::text) or is_team_lead(auth.uid()))));

create policy delete_lock_select on public.delete_lock for select using (is_team_lead(auth.uid()));
create policy delete_lock_update on public.delete_lock for update using (is_team_lead(auth.uid())) with check (is_team_lead(auth.uid()));

create policy trusted_devices_select on public.trusted_devices for select using ((user_id = auth.uid()));
create policy trusted_devices_insert on public.trusted_devices for insert with check ((user_id = auth.uid()));
create policy trusted_devices_update on public.trusted_devices for update using ((user_id = auth.uid()));
create policy trusted_devices_delete on public.trusted_devices for delete using ((user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- 7. 처음 값
-- ─────────────────────────────────────────────────────────────

insert into public.team_settings (key, value) values
  ('require_mfa', false),
  ('share_progress_with_members', false)
on conflict (key) do nothing;

-- 삭제 잠금 비밀번호 기본값 0000 (팀원관리 화면에서 바꾼다)
insert into public.delete_lock (id, password_sha256)
values (true, encode(digest('0000','sha256'),'hex'))
on conflict (id) do nothing;

-- ============================================================================
--  여기까지가 DB.  남은 일 세 가지
--
--  [서버 함수]  Supabase > Edge Functions 에 아래 세 개를 올린다.
--      pre-register-member   팀원 미리 등록
--      register-director     실장 등록
--      admin-reset-password  비밀번호 초기화
--    (코드는 저장소의 supabase/functions 폴더에 있다)
--
--  [주소 연결]  Vercel 에 같은 저장소를 연결하고 환경변수 두 개를 넣는다.
--      NEXT_PUBLIC_SUPABASE_URL
--      NEXT_PUBLIC_SUPABASE_ANON_KEY
--    저장소는 팀마다 같은 것을 쓴다 — 고치면 모든 팀에 같이 반영된다.
--
--  [첫 팀장]  Supabase > Authentication > Users 에서 팀장 계정을 하나 만들고,
--    아래를 한 번 실행한다 (메일 주소와 이름만 바꿔서).
--
--      update public.profiles
--         set role = '팀장', status = '승인', name = '홍길동',
--             team_name = '○○팀', sort_order = 10
--       where email = 'lead@회사메일';
--
--    그 다음은 그 팀장이 화면에서 팀원을 등록하면 된다.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────
-- 7. 알림 · 푸시 (새 팀도 같은 구조)
--    ※ 설치 후 할 일 (팀마다 한 번):
--      1) app_secrets 에 vapid_public / vapid_private / dispatch_key 넣기
--         (키 만들기: npx web-push generate-vapid-keys · dispatch_key 는 아무 긴 문자열)
--      2) src/lib/push.ts 의 VAPID_PUBLIC_KEY 를 그 팀 공개키로 (팀마다 다른 저장소가 아니면 공통 키 사용 가능)
--      3) Edge Function push-dispatch 올리기 (verify_jwt 끔)
--      4) 아래 cron 두 줄의 주소를 그 팀 프로젝트 주소로 바꿔 실행
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.app_secrets (key text primary key, value text not null, updated_at timestamptz default now());
alter table public.app_secrets enable row level security;  -- 정책 없음 = 서버(service_role)만

-- ─────────────────────────────────────────────────────────────
-- 알림 — 사람에게 "무슨 일이 생겼다"를 전하는 줄 하나.
-- 화면 종(🔔)과 푸시가 같은 표를 본다. 푸시를 못 받는 사람도 종으로는 본다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,              -- 지시 / 담당변경 / 질문 / 답변 / 제안 / 공지 / 보고 / 마감
  title text not null,
  body text,
  url text,                        -- 누르면 갈 곳
  task_id uuid,                    -- 같은 업무의 같은 종류 알림을 겹치지 않게 하는 용도
  created_at timestamptz default now() not null,
  read_at timestamptz,
  pushed_at timestamptz
);
create index if not exists notifications_user_unread on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists notifications_unpushed on public.notifications(created_at) where pushed_at is null;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());
-- insert 는 트리거(security definer)만 한다. 사람은 직접 못 넣는다.

-- 푸시 구독 — 기기 하나에 한 줄. 본인 것만 보고 지운다.
create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now() not null,
  last_ok_at timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy push_subs_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_subs_insert on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy push_subs_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subs_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- 화면이 실시간으로 받도록
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.notices;

-- ─────────────────────────────────────────────────────────────
-- 알림 넣는 도우미 — 같은 업무·같은 종류가 10분 안에 또 생기면 겹치지 않게 한다
-- ─────────────────────────────────────────────────────────────
create or replace function public.notify_user(
  p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_task uuid default null
) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_user is null then return; end if;
  -- 자기 일은 자기에게 알리지 않는다
  if p_user = auth.uid() then return; end if;
  if p_task is not null and exists (
    select 1 from public.notifications
     where user_id = p_user and kind = p_kind and task_id = p_task
       and created_at > now() - interval '10 minutes'
  ) then return; end if;
  insert into public.notifications(user_id, kind, title, body, url, task_id)
  values (p_user, p_kind, left(p_title, 120), left(coalesce(p_body,''), 300), p_url, p_task);
end $$;
revoke execute on function public.notify_user(uuid,text,text,text,text,uuid) from public, anon, authenticated;

/** 이 업무를 관리하는 사람들: 팀장·실장 + 담당자의 그룹장 */
create or replace function public.task_managers(p_assignee uuid, p_deputies uuid[])
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.profiles where status = '승인' and role in ('팀장','실장')
  union
  select p.id from public.profiles p
   where p.status = '승인' and p.role = '그룹장'
     and p.group_id is not null
     and p.group_id in (
       select group_id from public.profiles where id = p_assignee
       union
       select group_id from public.profiles where id = any(coalesce(p_deputies,'{}'))
     );
$$;
revoke execute on function public.task_managers(uuid,uuid[]) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 무슨 일이 생기면 누구에게
-- ─────────────────────────────────────────────────────────────

-- 1) 업무가 들어오면 담당자·참여자에게. 팀원이 스스로 올린 것은 관리자에게 「보고」로.
create or replace function public.notif_task_insert() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare d uuid; m uuid; who text;
begin
  select name into who from public.profiles where id = new.created_by;
  if new.source = '팀원추가' then
    for m in select * from public.task_managers(new.assignee_id, new.deputy_ids) loop
      perform public.notify_user(m, '보고', coalesce(who,'팀원')||' 님이 업무를 올렸습니다', new.title, '/reports', new.id);
    end loop;
  else
    perform public.notify_user(new.assignee_id, '지시',
      '새 업무 지시' || case when new.urgent then ' (긴급)' else '' end, new.title, '/tasks', new.id);
    foreach d in array coalesce(new.deputy_ids, '{}') loop
      perform public.notify_user(d, '지시', '참여자로 지정됨', new.title, '/tasks', new.id);
    end loop;
  end if;
  return new;
end $$;
create or replace trigger trg_notif_task_insert after insert on public.tasks
  for each row execute function public.notif_task_insert();

-- 2) 담당이 바뀌면 새 담당자에게
create or replace function public.notif_task_update() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare d uuid;
begin
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null then
    perform public.notify_user(new.assignee_id, '담당변경', '업무 담당이 되었습니다', new.title, '/tasks', new.id);
  end if;
  foreach d in array coalesce(new.deputy_ids, '{}') loop
    if not (d = any(coalesce(old.deputy_ids, '{}'))) then
      perform public.notify_user(d, '담당변경', '참여자로 지정됨', new.title, '/tasks', new.id);
    end if;
  end loop;
  return new;
end $$;
create or replace trigger trg_notif_task_update after update of assignee_id, deputy_ids on public.tasks
  for each row execute function public.notif_task_update();

-- 3) 질문은 관리자에게, 답변은 질문한 사람에게
create or replace function public.notif_task_update_row() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare t record; m uuid; who text; asker uuid;
begin
  select * into t from public.tasks where id = new.task_id;
  select name into who from public.profiles where id = new.author_id;
  if new.kind = '질문' then
    for m in select * from public.task_managers(t.assignee_id, t.deputy_ids) loop
      perform public.notify_user(m, '질문', coalesce(who,'팀원')||' 님의 질문', t.title||' — '||new.content, '/tasks', t.id);
    end loop;
  elsif new.kind = '답변' and new.reply_to is not null then
    select author_id into asker from public.task_updates where id = new.reply_to;
    perform public.notify_user(asker, '답변', coalesce(who,'팀장')||' 님이 답했습니다', t.title||' — '||new.content, '/tasks', t.id);
  end if;
  return new;
end $$;
create or replace trigger trg_notif_task_updates after insert on public.task_updates
  for each row execute function public.notif_task_update_row();

-- 4) 공지·제안 (팝업 켠 것만) — 올린 사람 빼고 전원
create or replace function public.notif_notice() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare u uuid; who text;
begin
  if not new.popup then return new; end if;
  select name into who from public.profiles where id = new.created_by;
  for u in select id from public.profiles where status = '승인' and id <> new.created_by loop
    perform public.notify_user(u, case when new.kind = '공지' then '공지' else '제안' end,
      case when new.kind = '공지' then '공지: ' else coalesce(who,'팀원')||' 님의 제안: ' end || new.title,
      new.content, '/notices', new.id);
  end loop;
  return new;
end $$;
create or replace trigger trg_notif_notice after insert on public.notices
  for each row execute function public.notif_notice();

-- 5) 마감 알림 — 매일 아침 한 번 (cron 이 부른다). 내일 마감·오늘 마감·지연 시작
create or replace function public.notify_due_tasks() returns int
language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0; d uuid;
begin
  for r in
    select t.*, (t.due_date - current_date) as left_days
      from public.tasks t
     where t.status <> '완료' and t.due_date is not null
       and t.due_date between current_date - 1 and current_date + 1
  loop
    for d in select unnest(array[r.assignee_id] || coalesce(r.deputy_ids,'{}')) loop
      if d is null then continue; end if;
      -- 하루에 한 번만 (task_id + kind 로 10분 중복 방지가 있지만, 날짜 단위로 한 번 더 막는다)
      if exists (select 1 from public.notifications where user_id = d and task_id = r.id and kind = '마감' and created_at::date = current_date) then continue; end if;
      insert into public.notifications(user_id, kind, title, body, url, task_id)
      values (d, '마감',
        case r.left_days when 1 then '내일 마감' when 0 then '오늘 마감' else '어제 마감 — 지연 시작' end,
        r.title, '/tasks', r.id);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_due_tasks() from public, anon, authenticated;


-- cron (주소를 그 팀 것으로 바꿔서)
-- select cron.schedule('push-dispatch-every-minute', '* * * * *', $$
--   select net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/push-dispatch',
--     headers := jsonb_build_object('Content-Type','application/json','x-dispatch-key',(select value from public.app_secrets where key='dispatch_key')),
--     body := '{}'::jsonb);
-- $$);
-- select cron.schedule('notify-due-tasks-0800-kst', '0 23 * * *', $$ select public.notify_due_tasks(); $$);
