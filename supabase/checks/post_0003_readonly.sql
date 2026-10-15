-- READ-ONLY verification to run AFTER applying 0003. Changes nothing.
-- Returns ONE row of JSON. Every "expect" value below is what a correct install returns.
select jsonb_pretty(jsonb_build_object(
  'new_tables_present (expect 10)', (select count(*) from pg_tables where schemaname = 'public' and tablename in
     ('classes','batches','tasks','lab_manuals','badge_definitions','submissions','daily_reports','student_badges','certificates','organization_settings')),
  'view_present (expect 1)', (select count(*) from pg_views where schemaname = 'public' and viewname = 'public_student_projects'),
  'tables_without_rls (expect [])', (select coalesce(jsonb_agg(tablename), '[]'::jsonb) from pg_tables where schemaname = 'public' and not rowsecurity),
  'badge_rules (expect 10 rows, Bronze cert=false, rest true)', (select jsonb_agg(jsonb_build_object('pos', position, 'level', level, 'req', required_projects, 'cert', certificate_eligible) order by position) from public.badge_definitions),
  'branding_rows (expect 1)', (select count(*) from public.organization_settings),
  'students_new_columns (expect 4)', (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name in ('user_id','batch_id','bio','profile_completed_at')),
  'students_badge_nullable (expect YES)', (select is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'students' and column_name = 'badge'),
  'students_policies (expect only "read visible students" + admin write)', (select jsonb_agg(policyname order by policyname) from pg_policies where schemaname = 'public' and tablename = 'students'),
  'triggers (expect 4)', (select jsonb_agg(tgname order by tgname) from pg_trigger where not tgisinternal and tgname in ('on_auth_user_created','students_delete_login','submissions_sync','submissions_touch')),
  'unique_indexes (expect 2)', (select count(*) from pg_indexes where schemaname = 'public' and indexname in ('submissions_title_uq','submissions_link_uq')),
  'anon_sees_user_id (expect false)', has_column_privilege('anon', 'public.students', 'user_id', 'select'),
  'anon_sees_name (expect true)', has_column_privilege('anon', 'public.students', 'name', 'select'),
  'anon_truncate_submissions (expect false)', has_table_privilege('anon', 'public.submissions', 'truncate'),
  'authed_insert_certificates (expect false)', has_table_privilege('authenticated', 'public.certificates', 'insert'),
  'anon_can_run_internal_fn (expect false)', has_function_privilege('anon', 'public._sync_student_progress(uuid,boolean)', 'execute'),
  'anon_can_verify_certificate (expect true)', has_function_privilege('anon', 'public.verify_certificate(text)', 'execute'),
  'legacy_data (unchanged by 0003)', jsonb_build_object('students', (select count(*) from public.students), 'projects', (select count(*) from public.projects), 'student_private', (select count(*) from public.student_private), 'admins', (select count(*) from public.admin_users))
)) as report;
