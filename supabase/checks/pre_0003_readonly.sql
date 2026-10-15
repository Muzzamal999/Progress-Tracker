-- READ-ONLY diagnostic. Changes nothing; safe to run any number of times.
-- Returns ONE row of JSON (the Supabase SQL Editor only shows the last result of a script).
-- Copy the single result cell and send it back. It contains no secrets.
select jsonb_pretty(jsonb_build_object(
  'database', current_database(),
  'role', current_user,
  'is_superuser', (select rolsuper from pg_roles where rolname = current_user),
  'server_version', current_setting('server_version'),
  -- Anything 0003 would create that already exists (a failed run without BEGIN could leave pieces). Expected: [].
  'leftover_objects', (
    select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
      select 'type:' || typname as x from pg_type where typnamespace = 'public'::regnamespace and typname = 'review_status'
      union all select 'table:' || tablename from pg_tables where schemaname = 'public' and tablename not in ('admin_users','projects','student_private','students')
      union all select 'view:' || viewname from pg_views where schemaname = 'public'
      union all select 'function:' || proname from pg_proc where pronamespace = 'public'::regnamespace and proname not in ('is_admin','save_student','touch_updated_at','rls_auto_enable')
      union all select 'trigger:' || tgname from pg_trigger where not tgisinternal and tgname in ('on_auth_user_created','students_delete_login','submissions_sync','submissions_touch')
    ) t),
  'students_columns', (select jsonb_agg(jsonb_build_object('col', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
                       from information_schema.columns where table_schema = 'public' and table_name = 'students'),
  'students_policies', (select coalesce(jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd)), '[]'::jsonb) from pg_policies where schemaname = 'public' and tablename = 'students'),
  'public_tables', (select jsonb_agg(jsonb_build_object('table', tablename, 'owner', tableowner, 'rls', rowsecurity) order by tablename) from pg_tables where schemaname = 'public'),
  'event_triggers', (select coalesce(jsonb_agg(jsonb_build_object('name', evtname, 'event', evtevent, 'fn', evtfoid::regproc::text, 'enabled', evtenabled)), '[]'::jsonb) from pg_event_trigger),
  'rls_auto_enable_source', (select pg_get_functiondef(oid) from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace),
  'auth_users_triggers', (select coalesce(jsonb_agg(tgname), '[]'::jsonb) from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal),
  'can_create_trigger_on_auth_users', has_table_privilege(current_user, 'auth.users', 'trigger'),
  'can_delete_from_auth_users', has_table_privilege(current_user, 'auth.users', 'delete'),
  'migration_history_rows', (select count(*) from information_schema.tables where table_schema = 'supabase_migrations')
)) as report;
