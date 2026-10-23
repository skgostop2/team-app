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
  created_at timestamp with time zone default now() not null
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

create or replace view public.v_tasks as
 select t.id,
    t.title,
    t.description,
    t.assignee_id,
    t.created_by,
    t.start_date,
    t.due_date,
    t.progress,
    t.status,
    t.confirmed_at,
    t.completed_at,
    t.created_at,
    t.updated_at,
    t.instructor,
    t.note,
    t.deputy_ids,
    t.source,
    coalesce(t.completed_at::date, current_date) - t.created_at::date as elapsed_days,
        case
            when t.due_date is null then null::integer
            else coalesce(t.completed_at::date, current_date) - t.due_date
        end as schedule_diff_days,
        case
            when t.due_date is null then 0
            else greatest(0, coalesce(t.completed_at::date, current_date) - t.due_date)
        end as overdue_days,
        case
            when t.completed_at is null or t.due_date is null then null::boolean
            else t.completed_at::date <= t.due_date
        end as on_time,
        case
            when t.status <> '완료'::text and t.due_date is not null and t.due_date < current_date then '지연'::text
            else t.status
        end as effective_status,
    t.confirmed_at is null as is_new,
    u.cnt as update_count,
    u.last_at as last_update_at,
    u.last_text as last_update_text,
    u.last_by as last_update_by,
    t.urgent
   from tasks t
     left join lateral ( select count(*) as cnt,
            max(tu.created_at) as last_at,
            (array_agg(tu.content order by tu.created_at desc))[1] as last_text,
            (array_agg(p.name order by tu.created_at desc))[1] as last_by
           from task_updates tu
             left join profiles p on p.id = tu.author_id
          where tu.task_id = t.id
            and coalesce(tu.kind, '기록') = '기록') u on true;

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
  using ((is_manager(auth.uid()) or (exists ( select 1 from tasks t
    where ((t.id = task_history.task_id) and ((t.assignee_id = auth.uid()) or (t.created_by = auth.uid())))))));

create policy task_assignee_log_select on public.task_assignee_log for select
  using ((is_manager(auth.uid()) or (prev_assignee_id = auth.uid()) or (new_assignee_id = auth.uid())));

-- 별표는 사람마다 따로 — 남의 별표는 보이지 않는다
create policy task_stars_select on public.task_stars for select using ((user_id = auth.uid()));
create policy task_stars_insert on public.task_stars for insert with check ((user_id = auth.uid()));
create policy task_stars_delete on public.task_stars for delete using ((user_id = auth.uid()));

create policy deleted_tasks_select on public.deleted_tasks for select using (is_manager(auth.uid()));

create policy notices_select on public.notices for select using (is_approved(auth.uid()));
create policy notices_insert on public.notices for insert with check (is_manager(auth.uid()));
create policy notices_update on public.notices for update using (is_manager(auth.uid()));
create policy notices_delete on public.notices for delete using (is_manager(auth.uid()));
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
