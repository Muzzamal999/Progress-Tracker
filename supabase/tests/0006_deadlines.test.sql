-- Database tests for migration 0006 (deadlines, RLS, review history, approval counting).
-- Runs against a THROWAWAY database that already has migrations 0001..0006 applied (never against production):
--   psql "$TEST_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0006_deadlines.test.sql
-- Everything happens in one transaction that is rolled back at the end, so nothing is left behind.
-- Any failed assertion raises an exception and aborts the run.

begin;

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'ASSERTION FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
-- Runs `stmt`; it MUST fail and the error message must contain `needle`.
create function pg_temp.fails(stmt text, needle text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(lower(needle) in lower(sqlerrm)) = 0 then
      raise exception 'ASSERTION FAILED: % (wrong error: %)', msg, sqlerrm;
    end if;
    raise notice 'ok - % [%]', msg, sqlerrm;
    return;
  end;
  raise exception 'ASSERTION FAILED: % (statement succeeded but must fail)', msg;
end $$;

-- ===== fixtures =====
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'db-admin@dbtest.local', '{}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'db-s1@dbtest.local', '{"registration":"student","full_name":"Student One"}', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'db-s2@dbtest.local', '{"registration":"student","full_name":"Student Two"}', 'authenticated', 'authenticated');
insert into public.admin_users (user_id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.classes (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Test class');
insert into public.batches (id, class_id, name) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Batch A');
insert into public.tasks (id, class_id, title) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'Task 1');
update public.students set batch_id = '00000000-0000-0000-0000-0000000000d1', profile_completed_at = now(), track = 'Web';

create temp table ctx as
  select (select id from public.students where user_id = '00000000-0000-0000-0000-0000000000b1') as s1,
         (select id from public.students where user_id = '00000000-0000-0000-0000-0000000000b2') as s2;
grant select on ctx to authenticated;

create function pg_temp.payload(title text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'title', title, 'description', 'd', 'type', 'mini', 'stack', jsonb_build_array('ts'),
    'attachments', jsonb_build_array(jsonb_build_object('url', 'https://res.cloudinary.com/demo/image/upload/v1/a.png', 'public_id', 'student-journey/evidence/a')),
    'lab_report', jsonb_build_object('url', 'https://res.cloudinary.com/demo/image/upload/v1/a.pdf', 'public_id', 'student-journey/lab-reports/a', 'name', 'r.pdf', 'pages', 1, 'bytes', 10)
  ) || extra;
$$;

-- ===== 1. default policy: no deadline configured =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.submit_project(pg_temp.payload('Alpha'));
  perform pg_temp.ok(true, 'no deadline + default policy "open": student can submit');
end $$;

select pg_temp.as_postgres();
update public.organization_settings set submission_default_policy = 'closed';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Beta'))$$, 'currently closed', 'default policy "closed" blocks when nothing is configured');
select pg_temp.as_postgres();
update public.organization_settings set submission_default_policy = 'open';

select pg_temp.as_postgres();
create temp table ids as select id as alpha from public.submissions where title = 'Alpha';
grant select on ids to authenticated;

-- ===== 2. deadline window boundaries (opens_at <= t < closes_at) =====
insert into public.submission_deadlines (id, kind, scope_type, class_id, opens_at, closes_at)
values ('00000000-0000-0000-0000-0000000000f1', 'project', 'class', '00000000-0000-0000-0000-0000000000c1',
        '2030-01-01 09:00:00+05', '2030-01-01 17:00:00+05');
do $$
declare s uuid := (select s1 from ctx);
  st text;
begin
  select state into st from public._deadline_window(s, 'project', null, '2030-01-01 08:59:59.999+05'); perform pg_temp.ok(st = 'scheduled', 'before opens_at => scheduled');
  select state into st from public._deadline_window(s, 'project', null, '2030-01-01 09:00:00+05');     perform pg_temp.ok(st = 'open', 'exactly at opens_at => open');
  select state into st from public._deadline_window(s, 'project', null, '2030-01-01 16:59:59.999+05'); perform pg_temp.ok(st = 'open', 'just before closes_at => open');
  select state into st from public._deadline_window(s, 'project', null, '2030-01-01 17:00:00+05');     perform pg_temp.ok(st = 'closed', 'exactly at closes_at => closed');
  -- Asia/Karachi is UTC+5: 17:00 PKT is 12:00 UTC
  select state into st from public._deadline_window(s, 'project', null, '2030-01-01 11:59:59+00');     perform pg_temp.ok(st = 'open', '11:59:59 UTC is still before 17:00 PKT');
  select state into st from public._deadline_window(s, 'project', null, '2030-01-01 12:00:00+00');     perform pg_temp.ok(st = 'closed', '12:00:00 UTC == 17:00 PKT => closed');
  perform pg_temp.ok(public._fmt_pkt('2030-01-01 12:00:00+00') = '01 Jan 2030, 05:00 PM PKT', 'display format uses Asia/Karachi');
end $$;

-- ===== 3. open window: submit works; expired window: submit/edit blocked =====
update public.submission_deadlines set opens_at = now() - interval '2 hours', closes_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.submit_project(pg_temp.payload('Gamma'));
  perform pg_temp.ok(true, 'inside the window: student can submit');
  perform pg_temp.ok((select count(*) from public.my_deadlines() where kind = 'project' and state = 'open' and configured) = 1, 'my_deadlines reports the open window');
end $$;

select pg_temp.as_postgres();
update public.submission_deadlines set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Delta'))$$, 'deadline has expired', 'after the deadline: submit_project is rejected by the database');
-- bypass attempts: write the tables directly, as the student, skipping the RPC
select pg_temp.fails($$insert into public.submissions (student_id, title, attachments) select s1, 'Sneaky', '[{"url":"x","public_id":"y"}]'::jsonb from ctx$$, 'row-level security', 'direct INSERT into submissions is denied by RLS');
do $$
declare n int;
begin
  update public.submissions set title = 'Edited after deadline' where title = 'Gamma';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'direct UPDATE of own submission affects 0 rows (no student write policy)');
  update public.submissions set status = 'approved' where title = 'Gamma';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'student cannot approve own project');
  delete from public.submissions where title = 'Gamma';
  get diagnostics n = row_count;
  perform pg_temp.ok(n = 0, 'student cannot delete own submission');
  perform pg_temp.ok((select count(*) from public.my_deadlines() where kind = 'project' and state = 'closed') = 1, 'my_deadlines reports the closed window');
end $$;
-- previously submitted work stays visible
do $$ begin
  perform pg_temp.ok((select count(*) from public.submissions) = 2, 'previously submitted work stays readable after the deadline');
end $$;
select pg_temp.fails($$select public.reopen_deadline('00000000-0000-0000-0000-0000000000f1', now() + interval '1 day', 'pls')$$, 'not authorized', 'student cannot reopen a deadline');
do $$ begin
  perform pg_temp.ok((select count(*) from public.submission_deadlines) = 0, 'student cannot read deadline rows directly');
end $$;
select pg_temp.fails($$insert into public.submission_deadlines (kind, opens_at, closes_at) values ('project', now(), now() + interval '1 day')$$, 'row-level security', 'student cannot create a deadline');
select pg_temp.fails($$select * from public.admin_progress_summary()$$, 'not authorized', 'student cannot read admin progress summary');

-- ===== 4. students cannot touch another student's records =====
do $$ begin
  perform pg_temp.ok((select count(*) from public.submissions where student_id = (select s2 from ctx)) = 0, 'student cannot read another student''s submissions');
end $$;

-- ===== 5. reopen by an admin lets submissions resume, and is audited =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.reopen_deadline('00000000-0000-0000-0000-0000000000f1', now() + interval '2 days', 'Power cut on deadline day');
  perform pg_temp.ok((select count(*) from public.audit_log where action = 'deadline.reopened' and entity_id = '00000000-0000-0000-0000-0000000000f1' and details->>'reason' = 'Power cut on deadline day') = 1, 'reopen writes exactly one audit entry with the reason');
end $$;
select pg_temp.fails($$select public.reopen_deadline('00000000-0000-0000-0000-0000000000f1', now() - interval '1 day', 'x')$$, 'must be in the future', 'cannot reopen into the past');
select pg_temp.fails($$insert into public.audit_log (action, entity) values ('forged', 'x')$$, 'permission denied', 'even admins cannot forge audit rows');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.submit_project(pg_temp.payload('Epsilon'));
  perform pg_temp.ok(true, 'after an admin reopens the deadline the student can submit again');
end $$;

-- ===== 6. per-student extension =====
select pg_temp.as_postgres();
update public.submission_deadlines set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.grant_deadline_extension('00000000-0000-0000-0000-0000000000f1', (select s2 from ctx), now() + interval '1 day', 'Medical leave');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Zeta'))$$, 'deadline has expired', 'extension for student 2 does not help student 1');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  perform public.submit_project(pg_temp.payload('Zeta'));
  perform pg_temp.ok(true, 'student 2, who has an extension, can submit');
end $$;
select pg_temp.as_postgres();
do $$ begin
  perform pg_temp.ok((select count(*) from public.audit_log where action = 'deadline.extension_granted' and details->'after'->>'deadline_id' = '00000000-0000-0000-0000-0000000000f1') = 1, 'extension is audited');
end $$;

-- ===== 7. most specific scope wins =====
insert into public.submission_deadlines (id, kind, scope_type, student_id, opens_at, closes_at)
values ('00000000-0000-0000-0000-0000000000f2', 'project', 'student', (select s1 from ctx), now() - interval '1 hour', now() + interval '1 day');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.submit_project(pg_temp.payload('Eta'));
  perform pg_temp.ok(true, 'a student-specific window overrides the closed class window');
end $$;
select pg_temp.as_postgres();
update public.submission_deadlines set is_active = false where id = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Theta'))$$, 'deadline has expired', 'deactivating the override falls back to the class window (closed)');
select pg_temp.as_postgres();

-- ===== 8. task deadlines (task-specific beats generic) + task visibility =====
insert into public.submission_deadlines (kind, scope_type, task_id, opens_at, closes_at)
values ('task', 'all', '00000000-0000-0000-0000-0000000000e1', now() - interval '1 hour', now() + interval '1 hour');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.submit_project(pg_temp.payload('Task work', jsonb_build_object('task_id', '00000000-0000-0000-0000-0000000000e1')));
  perform pg_temp.ok(true, 'task submission works inside the task window even though the generic project window is closed');
end $$;
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Again', jsonb_build_object('task_id', '00000000-0000-0000-0000-0000000000e1')))$$, 'already submitted', 'a task can only be submitted once');
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Other', jsonb_build_object('task_id', '00000000-0000-0000-0000-0000000000ee')))$$, 'not assigned', 'cannot submit against a task that is not yours');
select pg_temp.as_postgres();

-- ===== 9. lab report window =====
insert into public.submission_deadlines (id, kind, scope_type, opens_at, closes_at)
values ('00000000-0000-0000-0000-0000000000f3', 'lab_report', 'all', now() + interval '1 day', now() + interval '2 days');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select pg_temp.fails($$select public.submit_project(pg_temp.payload('Lab'))$$, 'not open yet', 'scheduled lab-report window blocks submissions until it opens');
select pg_temp.as_postgres();
delete from public.submission_deadlines where id = '00000000-0000-0000-0000-0000000000f3';

-- ===== 10. resubmission respects the window and keeps the original =====
update public.submission_deadlines set opens_at = now() - interval '1 hour', closes_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.review_item('submission', (select id from public.submissions where title = 'Epsilon'), 'rejected', 'Needs a README');
end $$;
select pg_temp.as_postgres();
update public.submission_deadlines set opens_at = now() - interval '3 hours', closes_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails(format($f$select public.resubmit_project(%L, pg_temp.payload('Epsilon v2'))$f$, (select id from public.submissions where title = 'Epsilon')), 'deadline has expired', 'resubmission after the deadline is rejected');
select pg_temp.as_postgres();
update public.submission_deadlines set closes_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform public.resubmit_project((select id from public.submissions where title = 'Epsilon'), pg_temp.payload('Epsilon v2'));
  perform pg_temp.ok(true, 'resubmission inside the window works');
end $$;
select pg_temp.as_postgres();
do $$ begin
  perform pg_temp.ok((select count(*) from public.review_events e join public.submissions s on s.id = e.item_id where s.title = 'Epsilon v2' and e.snapshot->>'title' = 'Epsilon') = 1, 'the original submission is preserved in review history');
  perform pg_temp.ok((select count(*) from public.review_events e join public.submissions s on s.id = e.item_id where s.title = 'Epsilon v2') = 3, 'history has submitted, rejected, resubmitted');
end $$;

-- ===== 11. approval counts exactly once; pending/rejected never count =====
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  perform pg_temp.ok((select max(counted) from public.my_progress()) = 0, 'pending/rejected projects do not count toward badges');
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$
declare v_id uuid := (select id from public.submissions where title = 'Alpha');
begin
  perform public.review_item('submission', v_id, 'approved', null);
  perform pg_temp.ok((select approved from public.admin_progress_summary() where student_id = (select s1 from ctx)) = 1, 'approval counts once');
  perform pg_temp.fails(format($f$select public.review_item('submission', %L, 'approved', null)$f$, v_id), 'already in that state', 'approving twice is refused');
  perform pg_temp.ok((select approved from public.admin_progress_summary() where student_id = (select s1 from ctx)) = 1, 'second approval attempt does not double count');
  perform public.review_item('submission', v_id, 'rejected', 'Withdrawn');
  perform pg_temp.ok((select approved from public.admin_progress_summary() where student_id = (select s1 from ctx)) = 0, 'withdrawing approval removes it from the totals');
  perform public.review_item('submission', v_id, 'approved', null);
  perform pg_temp.ok((select approved from public.admin_progress_summary() where student_id = (select s1 from ctx)) = 1, 're-approval counts once again');
end $$;
select pg_temp.fails($$select public.review_item('submission', (select id from public.submissions where title = 'Gamma'), 'rejected', '')$$, 'feedback is required', 'rejection requires feedback');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails($$select public.review_item('submission', (select id from public.submissions where title = 'Gamma'), 'approved', null)$$, 'not authorized', 'student cannot call review_item');

-- ===== 12. daily reports =====
select pg_temp.as_postgres();
insert into public.submission_deadlines (id, kind, scope_type, opens_at, closes_at)
values ('00000000-0000-0000-0000-0000000000f4', 'daily_report', 'all', now() - interval '3 hours', now() - interval '1 minute');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails($$select public.submit_daily_report(jsonb_build_object('summary', 'did things'))$$, 'deadline has expired', 'daily report is blocked after its deadline');
select pg_temp.as_postgres();
update public.submission_deadlines set closes_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000000f4';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$
declare v_id uuid; v_other uuid;
begin
  select id into v_other from public.submissions where title = 'Zeta'; -- belongs to student 2 (invisible to student 1)
  perform pg_temp.ok(v_other is null, 'student 1 cannot even see student 2''s project id');
  perform pg_temp.fails($q$select public.submit_daily_report(jsonb_build_object('summary', 'x', 'report_date', (public.app_today() + 1)::text))$q$, 'cannot be in the future', 'future-dated report refused (Karachi date)');
  v_id := public.submit_daily_report(jsonb_build_object('summary', 'Built the API', 'hours_spent', 6,
            'submission_ids', jsonb_build_array((select id from public.submissions where title = 'Alpha')),
            'task_ids', jsonb_build_array('00000000-0000-0000-0000-0000000000e1')));
  perform pg_temp.ok((select count(*) from public.daily_report_items where report_id = v_id) = 2, 'daily report links the student''s project and task');
  perform pg_temp.fails($q$select public.submit_daily_report(jsonb_build_object('summary', 'again'))$q$, 'duplicate', 'second report for the same date is refused');
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  perform pg_temp.fails(format($f$select public.submit_daily_report(jsonb_build_object('summary', 'steal', 'submission_ids', jsonb_build_array(%L)))$f$,
    (select alpha from ids)), 'only link your own', 'cannot link another student''s project');
  perform pg_temp.ok((select count(*) from public.daily_reports) = 0, 'student 2 cannot read student 1''s daily reports');
end $$;
select pg_temp.as_postgres();

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform pg_temp.ok((select count(*) from public.audit_log where entity = 'deadline' and created_at >= now()) >= 5, 'deadline changes were audited');
end $$;

select pg_temp.as_postgres();
do $$ begin
  update public.organization_settings set reporting_days = '{1,2,3,4,5,6}';
  perform pg_temp.ok((select count(*) from public.audit_log where action = 'policy.updated' and created_at >= now()) = 3 and exists (select 1 from public.audit_log where action = 'policy.updated' and created_at >= now() and summary like '%1,2,3,4,5,6'), 'policy changes (default policy x2, reporting days) are audited');
end $$;

rollback;
\echo ALL DATABASE TESTS PASSED
