-- Submission deadlines (server-enforced), per-student extensions, audit log, review history, daily-report links.
-- Additive and idempotent where practical: no table is dropped, no row is deleted, no existing column changes type.
-- Replaces three student RPCs (submit_project, resubmit_project, submit_daily_report) so they enforce the
-- submission window inside the database. Run it ONCE inside BEGIN; ... COMMIT; (psql -1 does this for you).
--
-- Time zone: every "today" and every displayed deadline uses Asia/Karachi (fixed UTC+05:00, no DST).
-- Deadlines are stored as timestamptz (an absolute instant), so the zone only matters for input/display.
-- Window semantics: opens_at <= now < closes_at (the closing instant itself is already closed).

-- ===== organisation-level policy =====
-- submission_default_policy: what happens for a submission type that has NO active deadline for the student.
--   'open'  (default, keeps the behaviour the app had before deadlines existed) or 'closed'.
-- reporting_days: ISO weekdays (1 = Monday .. 7 = Sunday) on which a daily report is expected from each student.
alter table public.organization_settings
  add column if not exists submission_default_policy text not null default 'open',
  add column if not exists reporting_days smallint[] not null default '{1,2,3,4,5}';
do $$ begin
  alter table public.organization_settings add constraint org_default_policy_chk check (submission_default_policy in ('open', 'closed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.organization_settings add constraint org_reporting_days_chk
    check (reporting_days <@ array[1,2,3,4,5,6,7]::smallint[] and cardinality(reporting_days) > 0);
exception when duplicate_object then null; end $$;

-- ===== time helpers =====
create or replace function public.app_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Karachi')::date; $$;

create or replace function public._fmt_pkt(t timestamptz) returns text
language sql immutable as $$ select to_char(t at time zone 'Asia/Karachi', 'DD Mon YYYY, HH12:MI AM') || ' PKT'; $$;

-- ===== deadlines =====
create table if not exists public.submission_deadlines (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('project', 'task', 'daily_report', 'lab_report')),
  title       text not null default '' check (length(title) <= 120),
  scope_type  text not null default 'all' check (scope_type in ('all', 'class', 'batch', 'student')),
  class_id    uuid references public.classes(id)  on delete cascade,
  batch_id    uuid references public.batches(id)  on delete cascade,
  student_id  uuid references public.students(id) on delete cascade,
  task_id     uuid references public.tasks(id)    on delete cascade,   -- only for kind = 'task': a deadline for one task
  opens_at    timestamptz not null,
  closes_at   timestamptz not null,
  is_active   boolean not null default true,       -- false = "Disabled": the rule is switched off and not enforced
  note        text check (note is null or length(note) <= 500),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (closes_at > opens_at),
  check (task_id is null or kind = 'task'),
  check (
    (scope_type = 'all'     and class_id is null     and batch_id is null     and student_id is null) or
    (scope_type = 'class'   and class_id is not null and batch_id is null     and student_id is null) or
    (scope_type = 'batch'   and batch_id is not null and class_id is null     and student_id is null) or
    (scope_type = 'student' and student_id is not null and class_id is null   and batch_id is null)
  )
);
create index if not exists submission_deadlines_kind_idx    on public.submission_deadlines (kind, is_active, closes_at);
create index if not exists submission_deadlines_class_idx   on public.submission_deadlines (class_id)   where class_id is not null;
create index if not exists submission_deadlines_batch_idx   on public.submission_deadlines (batch_id)   where batch_id is not null;
create index if not exists submission_deadlines_student_idx on public.submission_deadlines (student_id) where student_id is not null;
create index if not exists submission_deadlines_task_idx    on public.submission_deadlines (task_id)    where task_id is not null;

-- A per-student exception: this student may keep submitting against this deadline until extended_until.
create table if not exists public.deadline_extensions (
  id             uuid primary key default gen_random_uuid(),
  deadline_id    uuid not null references public.submission_deadlines(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  extended_until timestamptz not null,
  reason         text check (reason is null or length(reason) <= 500),
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (deadline_id, student_id)
);
create index if not exists deadline_extensions_student_idx on public.deadline_extensions (student_id);

-- ===== audit log (administrative actions; written only by database triggers/functions) =====
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  actor       uuid references auth.users(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  summary     text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx  on public.audit_log (entity, entity_id, created_at desc);

-- ===== review history (every status change of a project or daily report) =====
-- `snapshot` keeps the previous content of a submission when a student replaces a rejected one,
-- so the original submission is never lost.
create table if not exists public.review_events (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('submission', 'report')),
  item_id     uuid not null,
  student_id  uuid not null references public.students(id) on delete cascade,
  from_status public.review_status,
  to_status   public.review_status not null,
  feedback    text,
  actor       uuid references auth.users(id) on delete set null,
  title       text,
  snapshot    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists review_events_item_idx    on public.review_events (kind, item_id, created_at);
create index if not exists review_events_student_idx on public.review_events (student_id, created_at desc);

-- ===== daily report metadata =====
alter table public.daily_reports add column if not exists updated_at timestamptz not null default now();

-- Projects and tasks a student links to a daily report ("what I worked on / completed today").
create table if not exists public.daily_report_items (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.daily_reports(id) on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  task_id       uuid references public.tasks(id) on delete cascade,
  created_at    timestamptz not null default now(),
  check ((submission_id is null) <> (task_id is null))
);
create unique index if not exists daily_report_items_sub_uq  on public.daily_report_items (report_id, submission_id) where submission_id is not null;
create unique index if not exists daily_report_items_task_uq on public.daily_report_items (report_id, task_id)       where task_id is not null;
create index if not exists daily_report_items_sub_idx  on public.daily_report_items (submission_id) where submission_id is not null;
create index if not exists daily_report_items_task_idx on public.daily_report_items (task_id)       where task_id is not null;

create index if not exists daily_reports_date_idx on public.daily_reports (report_date, student_id);
create index if not exists submissions_submitted_idx on public.submissions (submitted_at);

-- ===== triggers =====
-- updated_at (reuses the generic helper from 0003)
drop trigger if exists daily_reports_touch on public.daily_reports;
create trigger daily_reports_touch before update on public.daily_reports for each row execute function public._touch_review();
drop trigger if exists submission_deadlines_touch on public.submission_deadlines;
create trigger submission_deadlines_touch before update on public.submission_deadlines for each row execute function public._touch_review();
drop trigger if exists deadline_extensions_touch on public.deadline_extensions;
create trigger deadline_extensions_touch before update on public.deadline_extensions for each row execute function public._touch_review();

create or replace function public._stamp_creator() returns trigger
language plpgsql as $$
begin
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
drop trigger if exists submission_deadlines_creator on public.submission_deadlines;
create trigger submission_deadlines_creator before insert on public.submission_deadlines for each row execute function public._stamp_creator();
drop trigger if exists deadline_extensions_creator on public.deadline_extensions;
create trigger deadline_extensions_creator before insert on public.deadline_extensions for each row execute function public._stamp_creator();

-- Audit trail for deadlines and extensions. The reopen/extend RPCs label the entry and supply the reason
-- through two transaction-local settings, so one change produces one audit row.
create or replace function public._audit_deadline_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_entity text := case tg_table_name when 'submission_deadlines' then 'deadline' else 'deadline_extension' end;
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_default text := v_entity || '.' || case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end;
  v_summary text;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then return null; end if;
  if v_entity = 'deadline' then
    v_summary := (v_row->>'kind') || ' · ' || (v_row->>'scope_type') || ' · ' ||
                 public._fmt_pkt((v_row->>'opens_at')::timestamptz) || ' → ' || public._fmt_pkt((v_row->>'closes_at')::timestamptz);
  else
    v_summary := 'until ' || public._fmt_pkt((v_row->>'extended_until')::timestamptz);
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, entity_id, summary, details)
  values (v_actor, (select u.email from auth.users u where u.id = v_actor),
          coalesce(nullif(current_setting('app.audit_action', true), ''), v_default),
          v_entity, (v_row->>'id')::uuid, v_summary,
          jsonb_strip_nulls(jsonb_build_object(
            'before', case when tg_op <> 'INSERT' then to_jsonb(old) end,
            'after',  case when tg_op <> 'DELETE' then to_jsonb(new) end,
            'reason', nullif(current_setting('app.audit_reason', true), ''))));
  return null;
end $$;
drop trigger if exists submission_deadlines_audit on public.submission_deadlines;
create trigger submission_deadlines_audit after insert or update or delete on public.submission_deadlines
  for each row execute function public._audit_deadline_trg();
drop trigger if exists deadline_extensions_audit on public.deadline_extensions;
create trigger deadline_extensions_audit after insert or update or delete on public.deadline_extensions
  for each row execute function public._audit_deadline_trg();

-- Audit trail for the organisation-level submission policy (default open/closed, reporting weekdays).
create or replace function public._audit_org_policy_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if new.submission_default_policy is not distinct from old.submission_default_policy
     and new.reporting_days is not distinct from old.reporting_days then
    return null;
  end if;
  insert into public.audit_log (actor, actor_email, action, entity, summary, details)
  values (v_actor, (select u.email from auth.users u where u.id = v_actor), 'policy.updated', 'organization_settings',
          'default policy ' || new.submission_default_policy || ', reporting days ' || array_to_string(new.reporting_days, ','),
          jsonb_build_object(
            'before', jsonb_build_object('submission_default_policy', old.submission_default_policy, 'reporting_days', old.reporting_days),
            'after',  jsonb_build_object('submission_default_policy', new.submission_default_policy, 'reporting_days', new.reporting_days)));
  return null;
end $$;
drop trigger if exists organization_settings_policy_audit on public.organization_settings;
create trigger organization_settings_policy_audit after update on public.organization_settings
  for each row execute function public._audit_org_policy_trg();

-- Review history for projects and daily reports.
create or replace function public._review_events_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := case tg_table_name when 'submissions' then 'submission' else 'report' end;
  v_new jsonb := to_jsonb(new);
  v_title text := coalesce(v_new->>'title', 'Report for ' || (v_new->>'report_date'));
begin
  if tg_op = 'INSERT' then
    insert into public.review_events (kind, item_id, student_id, from_status, to_status, actor, title)
    values (v_kind, new.id, new.student_id, null, new.status, auth.uid(), v_title);
  elsif old.status is distinct from new.status then
    insert into public.review_events (kind, item_id, student_id, from_status, to_status, feedback, actor, title, snapshot)
    values (v_kind, new.id, new.student_id, old.status, new.status,
            case when new.status = 'pending' then null else new.feedback end, auth.uid(), v_title,
            -- a student replacing a rejected item: keep what they originally sent
            case when old.status = 'rejected' and new.status = 'pending'
                 then to_jsonb(old) - 'status' - 'reviewed_by' - 'reviewed_at' end);
  end if;
  return null;
end $$;
drop trigger if exists submissions_history on public.submissions;
create trigger submissions_history after insert or update on public.submissions
  for each row execute function public._review_events_trg();
drop trigger if exists daily_reports_history on public.daily_reports;
create trigger daily_reports_history after insert or update on public.daily_reports
  for each row execute function public._review_events_trg();

-- Backfill: one "submitted" event per existing item, plus its latest decision, so history is complete from day one.
insert into public.review_events (kind, item_id, student_id, from_status, to_status, feedback, actor, title, created_at)
select 'submission', s.id, s.student_id, null, 'pending', null, null, s.title, s.submitted_at
from public.submissions s
where not exists (select 1 from public.review_events e where e.kind = 'submission' and e.item_id = s.id);
insert into public.review_events (kind, item_id, student_id, from_status, to_status, feedback, actor, title, created_at)
select 'submission', s.id, s.student_id, 'pending', s.status, s.feedback, s.reviewed_by, s.title, coalesce(s.reviewed_at, s.updated_at)
from public.submissions s
where s.status <> 'pending'
  and not exists (select 1 from public.review_events e where e.kind = 'submission' and e.item_id = s.id and e.to_status = s.status);
insert into public.review_events (kind, item_id, student_id, from_status, to_status, feedback, actor, title, created_at)
select 'report', r.id, r.student_id, null, 'pending', null, null, 'Report for ' || r.report_date, r.submitted_at
from public.daily_reports r
where not exists (select 1 from public.review_events e where e.kind = 'report' and e.item_id = r.id);
insert into public.review_events (kind, item_id, student_id, from_status, to_status, feedback, actor, title, created_at)
select 'report', r.id, r.student_id, 'pending', r.status, r.feedback, r.reviewed_by, 'Report for ' || r.report_date, coalesce(r.reviewed_at, r.submitted_at)
from public.daily_reports r
where r.status <> 'pending'
  and not exists (select 1 from public.review_events e where e.kind = 'report' and e.item_id = r.id and e.to_status = r.status);

-- ===== deadline resolution (the single source of truth for "may this student submit now?") =====
-- Candidate deadlines are the ACTIVE ones that apply to the student (all / their class / their batch / themselves,
-- and for kind 'task' optionally one specific task). The most specific applies: task-specific beats generic,
-- student beats batch beats class beats all. Among equals an open window wins, then the next scheduled one,
-- then the most recently closed. A student's extension can only move the closing time later.
-- No candidate = "not configured": the organisation's default policy decides.
create or replace function public._deadline_window(p_student uuid, p_kind text, p_task uuid default null, p_at timestamptz default now())
returns table (deadline_id uuid, opens_at timestamptz, closes_at timestamptz, state text, scope_type text, extended boolean, configured boolean)
language sql stable security definer set search_path = public as $$
  with me as (
    select s.id, s.batch_id, b.class_id
    from public.students s left join public.batches b on b.id = s.batch_id
    where s.id = p_student
  ), cand as (
    select d.id, d.opens_at, d.scope_type, d.task_id,
           greatest(d.closes_at, coalesce(e.extended_until, d.closes_at)) as eff_close,
           (e.extended_until is not null and e.extended_until > d.closes_at) as ext
    from public.submission_deadlines d
    join me on true
    left join public.deadline_extensions e on e.deadline_id = d.id and e.student_id = me.id
    where d.is_active and d.kind = p_kind
      and (d.task_id is null or d.task_id = p_task)
      and (d.scope_type = 'all'
        or (d.scope_type = 'student' and d.student_id = me.id)
        or (d.scope_type = 'batch'   and d.batch_id   = me.batch_id)
        or (d.scope_type = 'class'   and d.class_id   = me.class_id))
  ), pick as (
    select c.*,
           case when p_at < c.opens_at then 'scheduled' when p_at < c.eff_close then 'open' else 'closed' end as st
    from cand c
    order by (c.task_id is not null) desc,
             case c.scope_type when 'student' then 4 when 'batch' then 3 when 'class' then 2 else 1 end desc,
             case when p_at < c.opens_at then 1 when p_at < c.eff_close then 0 else 2 end,
             case when p_at < c.opens_at then c.opens_at end asc nulls last,
             c.eff_close desc
    limit 1
  )
  select id, opens_at, eff_close, st, scope_type, ext, true from pick
  union all
  select null::uuid, null::timestamptz, null::timestamptz,
         case when coalesce((select o.submission_default_policy from public.organization_settings o limit 1), 'open') = 'open' then 'open' else 'closed' end,
         null::text, false, false
  where not exists (select 1 from pick);
$$;

create or replace function public._assert_window(p_student uuid, p_kind text, p_task uuid default null) returns void
language plpgsql stable security definer set search_path = public as $$
declare w record;
begin
  select * into w from public._deadline_window(p_student, p_kind, p_task);
  if w.state = 'open' then return; end if;
  if w.state = 'scheduled' then
    raise exception 'Submissions are not open yet. They open on %.', public._fmt_pkt(w.opens_at);
  end if;
  if w.configured then
    raise exception 'Submission deadline has expired. Contact your administrator if an extension is required.';
  end if;
  raise exception 'Submissions are currently closed. Contact your administrator.';
end $$;

create or replace function public._task_visible(p_student uuid, p_task uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tasks t
    join public.students s on s.id = p_student
    join public.batches b on b.id = s.batch_id
    where t.id = p_task and t.is_active and t.class_id = b.class_id and (t.batch_id is null or t.batch_id = s.batch_id));
$$;

-- The signed-in student's windows (what the dashboard shows). server_now lets the browser display a countdown
-- without trusting its own clock.
create or replace function public.my_deadlines()
returns table (kind text, task_id uuid, deadline_id uuid, opens_at timestamptz, closes_at timestamptz, state text,
               configured boolean, extended boolean, server_now timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public.current_student_id() as id),
  targets as (
    select k as kind, null::uuid as task_id from unnest(array['project', 'task', 'daily_report', 'lab_report']) k
    union
    select 'task', d.task_id from public.submission_deadlines d, me
    where d.task_id is not null and d.is_active and public._task_visible(me.id, d.task_id)
  )
  select t.kind, t.task_id, w.deadline_id, w.opens_at, w.closes_at, w.state, w.configured, w.extended, now()
  from targets t cross join me
  cross join lateral public._deadline_window(me.id, t.kind, t.task_id) w
  where me.id is not null;
$$;

-- ===== admin: reopen a deadline / grant or revoke a per-student extension =====
create or replace function public.reopen_deadline(p_id uuid, p_closes_at timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_closes_at is null or p_closes_at <= now() then raise exception 'The new closing time must be in the future'; end if;
  perform set_config('app.audit_action', 'deadline.reopened', true);
  perform set_config('app.audit_reason', coalesce(v_reason, ''), true);
  update public.submission_deadlines set
    is_active = true,
    opens_at = least(opens_at, now()),
    closes_at = p_closes_at
  where id = p_id;
  if not found then raise exception 'Deadline not found'; end if;
end $$;

create or replace function public.grant_deadline_extension(p_deadline uuid, p_student uuid, p_until timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_until is null or p_until <= now() then raise exception 'The extension must end in the future'; end if;
  if not exists (select 1 from public.submission_deadlines where id = p_deadline) then raise exception 'Deadline not found'; end if;
  perform set_config('app.audit_action', 'deadline.extension_granted', true);
  perform set_config('app.audit_reason', coalesce(v_reason, ''), true);
  insert into public.deadline_extensions (deadline_id, student_id, extended_until, reason)
  values (p_deadline, p_student, p_until, v_reason)
  on conflict (deadline_id, student_id) do update set extended_until = excluded.extended_until, reason = excluded.reason;
end $$;

create or replace function public.revoke_deadline_extension(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  perform set_config('app.audit_action', 'deadline.extension_revoked', true);
  delete from public.deadline_extensions where id = p_id;
  if not found then raise exception 'Extension not found'; end if;
end $$;

-- Per-student totals for the admin dashboards and PDF reports. Uses the same progress function as the badge
-- ladder, so the numbers can never disagree with the student's own dashboard.
create or replace function public.admin_progress_summary()
returns table (student_id uuid, approved int, pending int, rejected int, completed_badges int, current_badge text,
               next_badge text, next_counted int, next_required int, overall_percent int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query
  select s.id,
         (select count(*)::int from public.submissions x where x.student_id = s.id and x.status = 'approved'),
         (select count(*)::int from public.submissions x where x.student_id = s.id and x.status = 'pending'),
         (select count(*)::int from public.submissions x where x.student_id = s.id and x.status = 'rejected'),
         coalesce(p.done, 0),
         p.cur, p.nxt, coalesce(p.nc, 0), coalesce(p.nr, 0), coalesce(p.pct, 0)
  from public.students s
  left join lateral (
    select count(*) filter (where pr.state = 'completed')::int as done,
           (array_agg(pr.name order by pr."position" desc) filter (where pr.state = 'completed'))[1] as cur,
           max(pr.name) filter (where pr.state = 'active') as nxt,
           max(pr.counted) filter (where pr.state = 'active')::int as nc,
           max(pr.required) filter (where pr.state = 'active')::int as nr,
           case when sum(pr.required) > 0 then round(100.0 * sum(pr.counted) / sum(pr.required))::int else 0 end as pct
    from public._student_progress(s.id) pr) p on true;
end $$;

-- Names the reviewers/actors on admin screens (auth.users is not readable by the API, so this is the one lookup).
create or replace function public.admin_actor_emails(p_ids uuid[])
returns table (id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query select u.id, u.email::text from auth.users u where u.id = any(p_ids);
end $$;

-- ===== student RPCs, now deadline-aware =====
create or replace function public.submit_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student(); v_id uuid; v_task uuid := nullif(p->>'task_id', '')::uuid;
begin
  if v_task is not null and not public._task_visible(sid, v_task) then
    raise exception 'That task is not assigned to you';
  end if;
  perform public._assert_window(sid, case when v_task is null then 'project' else 'task' end, v_task);
  perform public._assert_window(sid, 'lab_report', null);
  if v_task is not null and exists (select 1 from public.submissions where student_id = sid and task_id = v_task and status <> 'rejected') then
    raise exception 'You have already submitted this task. Submissions are locked once sent.';
  end if;
  insert into public.submissions (student_id, task_id, title, description, type, stack, link, attachments, lab_report)
  values (sid, v_task, left(trim(p->>'title'), 120), nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
          coalesce((p->>'type')::public.project_type, 'mini'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
          nullif(trim(coalesce(p->>'link', '')), ''), public._check_attachments(p->'attachments', 1, 'student-journey/evidence'),
          public._check_pdf(p->'lab_report', 'student-journey/lab-reports', true))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.resubmit_project(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student(); v_task uuid;
begin
  select task_id into v_task from public.submissions where id = p_id and student_id = sid and status = 'rejected';
  if not found then raise exception 'Only your rejected submissions can be resubmitted'; end if;
  perform public._assert_window(sid, case when v_task is null then 'project' else 'task' end, v_task);
  perform public._assert_window(sid, 'lab_report', null);
  update public.submissions set
    title = left(trim(p->>'title'), 120), description = nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
    type = coalesce((p->>'type')::public.project_type, type),
    stack = coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
    link = nullif(trim(coalesce(p->>'link', '')), ''), attachments = public._check_attachments(p->'attachments', 1, 'student-journey/evidence'),
    lab_report = public._check_pdf(p->'lab_report', 'student-journey/lab-reports', true),
    status = 'pending', reviewed_by = null, reviewed_at = null, resubmit_count = resubmit_count + 1, submitted_at = now()
  where id = p_id and student_id = sid and status = 'rejected';
end $$;

-- Daily report: "today" is the Karachi date; links to the student's own projects/tasks are validated.
-- p = { report_date?, summary, hours_spent?, blockers?, attachments?, submission_ids?[], task_ids?[] }
create or replace function public.submit_daily_report(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public._require_ready_student(); v_id uuid; v_today date := public.app_today();
  v_date date := coalesce(nullif(p->>'report_date', '')::date, v_today);
  v_hours numeric := nullif(p->>'hours_spent', '')::numeric;
  v_att jsonb := public._check_attachments(coalesce(p->'attachments', '[]'::jsonb), 0, 'student-journey/evidence');
  v_subs uuid[] := coalesce(array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p->'submission_ids', '[]'::jsonb)) x), '{}');
  v_tasks uuid[] := coalesce(array(select distinct x::uuid from jsonb_array_elements_text(coalesce(p->'task_ids', '[]'::jsonb)) x), '{}');
begin
  if v_date > v_today then raise exception 'Report date cannot be in the future'; end if;
  perform public._assert_window(sid, 'daily_report', null);
  if cardinality(v_subs) > 20 or cardinality(v_tasks) > 20 then raise exception 'Link at most 20 projects and 20 tasks'; end if;
  if exists (select 1 from unnest(v_subs) u where not exists (select 1 from public.submissions s where s.id = u and s.student_id = sid)) then
    raise exception 'You can only link your own projects';
  end if;
  if exists (select 1 from unnest(v_tasks) u where not public._task_visible(sid, u)) then
    raise exception 'You can only link tasks assigned to you';
  end if;

  update public.daily_reports set
    summary = left(trim(p->>'summary'), 4000), hours_spent = v_hours, blockers = nullif(left(trim(coalesce(p->>'blockers', '')), 2000), ''),
    attachments = v_att, status = 'pending', reviewed_by = null, reviewed_at = null, submitted_at = now()
  where student_id = sid and report_date = v_date and status = 'rejected'
  returning id into v_id;
  if v_id is not null then
    delete from public.daily_report_items where report_id = v_id;
  else
    insert into public.daily_reports (student_id, report_date, summary, hours_spent, blockers, attachments)
    values (sid, v_date, left(trim(p->>'summary'), 4000), v_hours, nullif(left(trim(coalesce(p->>'blockers', '')), 2000), ''), v_att)
    returning id into v_id;
  end if;
  insert into public.daily_report_items (report_id, submission_id) select v_id, u from unnest(v_subs) u;
  insert into public.daily_report_items (report_id, task_id)       select v_id, u from unnest(v_tasks) u;
  return v_id;
end $$;

-- ===== privileges =====
revoke all on function public.app_today(), public._fmt_pkt(timestamptz), public._stamp_creator(),
  public._audit_deadline_trg(), public._audit_org_policy_trg(), public._review_events_trg(),
  public._deadline_window(uuid, text, uuid, timestamptz), public._assert_window(uuid, text, uuid), public._task_visible(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.my_deadlines(), public.reopen_deadline(uuid, timestamptz, text),
  public.grant_deadline_extension(uuid, uuid, timestamptz, text), public.revoke_deadline_extension(uuid),
  public.admin_progress_summary(), public.admin_actor_emails(uuid[]) from public, anon;
grant execute on function public.my_deadlines(), public.reopen_deadline(uuid, timestamptz, text),
  public.grant_deadline_extension(uuid, uuid, timestamptz, text), public.revoke_deadline_extension(uuid),
  public.admin_progress_summary(), public.admin_actor_emails(uuid[]) to authenticated;
-- app_today() is used by clients to build date defaults; it reveals nothing sensitive.
grant execute on function public.app_today() to authenticated;
-- create or replace keeps existing grants for the three replaced RPCs.

-- ===== RLS =====
alter table public.submission_deadlines enable row level security;
alter table public.deadline_extensions  enable row level security;
alter table public.audit_log            enable row level security;
alter table public.review_events        enable row level security;
alter table public.daily_report_items   enable row level security;

drop policy if exists "admin manage deadlines" on public.submission_deadlines;
create policy "admin manage deadlines" on public.submission_deadlines for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin manage extensions" on public.deadline_extensions;
create policy "admin manage extensions" on public.deadline_extensions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin read audit" on public.audit_log;
create policy "admin read audit" on public.audit_log for select using (public.is_admin());
drop policy if exists "read own review events" on public.review_events;
create policy "read own review events" on public.review_events for select using (student_id = public.current_student_id() or public.is_admin());
drop policy if exists "read own report items" on public.daily_report_items;
create policy "read own report items" on public.daily_report_items for select
  using (public.is_admin() or exists (select 1 from public.daily_reports r where r.id = report_id and r.student_id = public.current_student_id()));
drop policy if exists "admin write report items" on public.daily_report_items;
create policy "admin write report items" on public.daily_report_items for all using (public.is_admin()) with check (public.is_admin());

-- Students never read deadlines directly (my_deadlines() is their view) and never write any of these tables.
revoke all on public.submission_deadlines, public.deadline_extensions, public.audit_log, public.review_events, public.daily_report_items from anon;
-- Admins write through their own authenticated session, so authenticated keeps DML rights; the RLS policies
-- above restrict every one of these tables to admins (students get zero rows / permission errors).
revoke insert, update, delete, truncate, references, trigger on public.audit_log, public.review_events from authenticated;
revoke truncate, references, trigger on public.submission_deadlines, public.deadline_extensions, public.daily_report_items from authenticated;
