-- Student Journey Atlas: schema, helpers and Row Level Security.
-- Run in the Supabase SQL editor (or `supabase db push`).

-- ===== enums =====
create type public.track as enum ('Web','Android','Backend','Frontend');
create type public.badge_level as enum
  ('Bronze','Silver','Gold','Platinum','Diamond','Obsidian','Crystal','Titanium','Master','Legend');
create type public.project_type as enum ('mini','intermediate','real');

-- ===== tables =====
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,   -- public URL id, e.g. 'hussam-ishtiaq-qureshi'
  legacy_id       text unique,            -- old 'stu-002' id, only for redirecting old links
  name            text not null check (length(trim(name)) > 0),
  image_url       text,            -- Cloudinary secure_url
  image_public_id text,            -- Cloudinary public_id, needed for deletion
  track           public.track       not null default 'Web',
  badge           public.badge_level not null default 'Bronze',
  skills          text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title      text not null,
  type       public.project_type not null default 'mini',
  solo       boolean not null default true,
  stack      text[] not null default '{}',
  link       text,
  position   int  not null default 0,
  created_at timestamptz not null default now()
);
create index on public.projects(student_id, position);

-- admin-only contact details (never readable by the public)
create table public.student_private (
  student_id uuid primary key references public.students(id) on delete cascade,
  email      text
);
create unique index student_private_email_uq on public.student_private (lower(email)) where email is not null;

-- admins allowlist
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger students_touch before update on public.students
  for each row execute function public.touch_updated_at();

-- ===== RLS =====
alter table public.students    enable row level security;
alter table public.projects    enable row level security;
alter table public.admin_users enable row level security;
alter table public.student_private enable row level security;

create policy "public read students" on public.students for select using (true);
create policy "public read projects" on public.projects for select using (true);
create policy "admin write students" on public.students for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admin write projects" on public.projects for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admin only private" on public.student_private for all
  using (public.is_admin()) with check (public.is_admin());
create policy "admin reads own row" on public.admin_users for select
  using (user_id = auth.uid());

-- Atomic create/update of a student, its private email and its whole project list.
-- Everything runs in one transaction: either all of it is saved or none of it.
--
-- student  = { id?, slug?, name, email?, track, badge, skills[], image_url?, image_public_id? }
-- projects = [ { title, type, solo, stack[], link? }, ... ]  (array order becomes `position`)
-- Returns the student's uuid.

create or replace function public.save_student(student jsonb, projects jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid     uuid;
  p       jsonb;
  idx     int := 0;
  v_email text := nullif(trim(student->>'email'), '');
  v_skills text[] := coalesce(array(select jsonb_array_elements_text(coalesce(student->'skills', '[]'::jsonb))), '{}');
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  sid := nullif(student->>'id', '')::uuid;

  if sid is null then
    insert into public.students (slug, name, image_url, image_public_id, track, badge, skills)
    values (
      student->>'slug',
      student->>'name',
      student->>'image_url',
      student->>'image_public_id',
      (student->>'track')::public.track,
      (student->>'badge')::public.badge_level,
      v_skills
    )
    returning id into sid;
  else
    -- slug is intentionally NOT updated: shared links must keep working
    update public.students set
      name            = student->>'name',
      image_url       = student->>'image_url',
      image_public_id = student->>'image_public_id',
      track           = (student->>'track')::public.track,
      badge           = (student->>'badge')::public.badge_level,
      skills          = v_skills
    where id = sid;
    if not found then
      raise exception 'student not found' using errcode = 'P0002';
    end if;
    delete from public.projects where student_id = sid;
  end if;

  if v_email is null then
    delete from public.student_private where student_id = sid;
  else
    insert into public.student_private (student_id, email) values (sid, v_email)
    on conflict (student_id) do update set email = excluded.email;
  end if;

  for p in select * from jsonb_array_elements(coalesce(projects, '[]'::jsonb)) loop
    insert into public.projects (student_id, title, type, solo, stack, link, position)
    values (
      sid,
      p->>'title',
      (p->>'type')::public.project_type,
      coalesce((p->>'solo')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
      nullif(p->>'link', ''),
      idx
    );
    idx := idx + 1;
  end loop;

  return sid;
end;
$$;

revoke all on function public.save_student(jsonb, jsonb) from public, anon;
grant execute on function public.save_student(jsonb, jsonb) to authenticated;

-- Student accounts, submissions with admin review, sequential badges and certificates.
-- Additive: no existing table is dropped or truncated and no existing row is deleted.
-- Existing students/projects keep working; `students.badge` becomes nullable so that a
-- self-registered student starts with NO badge (nothing is pre-unlocked).

-- ===== enums =====
create type public.review_status as enum ('pending', 'approved', 'rejected');

-- ===== organisation branding (single row) =====
create table public.organization_settings (
  id                   boolean primary key default true check (id),
  org_name             text not null default 'Student Journey Atlas' check (length(trim(org_name)) > 0),
  tagline              text,
  logo_url             text,
  logo_public_id       text,
  accent_color         text not null default '#4f46e5' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  signatory_name       text,
  signatory_title      text,
  certificate_footer   text,
  updated_at           timestamptz not null default now()
);
insert into public.organization_settings (id) values (true) on conflict do nothing;

-- ===== classes / batches =====
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index classes_name_uq on public.classes (lower(name));

create table public.batches (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  starts_on  date,
  ends_on    date,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index batches_name_uq on public.batches (class_id, lower(name));

-- ===== students: link to an auth account, profile + enrolment =====
alter table public.students
  add column user_id              uuid unique references auth.users(id) on delete cascade,
  add column batch_id             uuid references public.batches(id) on delete set null,
  add column bio                  text,
  add column profile_completed_at timestamptz;
alter table public.students alter column badge drop not null;
alter table public.students alter column badge drop default;

-- ===== tasks and lab manuals (set by the admin) =====
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  batch_id    uuid references public.batches(id) on delete cascade,   -- null = whole class
  title       text not null check (length(trim(title)) > 0),
  description text,
  due_date    date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.lab_manuals (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  batch_id    uuid references public.batches(id) on delete cascade,   -- null = whole class
  title       text not null check (length(trim(title)) > 0),
  description text,
  body        text,
  images      jsonb not null default '[]'::jsonb,   -- [{url, public_id}]
  created_at  timestamptz not null default now()
);

-- ===== badge rules (admin-configurable) =====
-- `level` ties a rule to one of the 10 existing badge styles; `name` is the display label.
create table public.badge_definitions (
  id                   uuid primary key default gen_random_uuid(),
  level                public.badge_level not null unique,
  name                 text not null check (length(trim(name)) > 0),
  position             int  not null,
  required_projects    int  not null default 3 check (required_projects between 1 and 100),
  certificate_eligible boolean not null default true,
  is_active            boolean not null default true,
  unique (position) deferrable initially deferred
);
-- The existing ladder, in its existing order. The lowest level (Bronze) gets no certificate by default.
insert into public.badge_definitions (level, name, position, certificate_eligible)
select b, b::text, ord::int, b <> 'Bronze'
from unnest(enum_range(null::public.badge_level)) with ordinality as t(b, ord)
on conflict (level) do nothing;

-- ===== submissions (projects) =====
create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  task_id      uuid references public.tasks(id) on delete set null,
  title        text not null check (length(trim(title)) between 1 and 120),
  description  text,
  type         public.project_type not null default 'mini',
  stack        text[] not null default '{}',
  link         text check (link is null or link ~* '^https?://'),
  attachments  jsonb not null check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) between 1 and 6),
  status       public.review_status not null default 'pending',
  feedback     text,
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  resubmit_count int not null default 0,
  submitted_at timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.submissions (student_id, status);
create index on public.submissions (status, submitted_at);
-- Uniqueness: a student cannot have two live (pending/approved) submissions with the same title or link.
create unique index submissions_title_uq on public.submissions (student_id, lower(trim(title))) where status <> 'rejected';
create unique index submissions_link_uq  on public.submissions (student_id, lower(trim(link)))  where status <> 'rejected' and link is not null;

-- ===== daily reports =====
create table public.daily_reports (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  report_date  date not null,
  summary      text not null check (length(trim(summary)) between 1 and 4000),
  hours_spent  numeric(4,1) check (hours_spent is null or (hours_spent >= 0 and hours_spent <= 24)),
  blockers     text,
  attachments  jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 6),
  status       public.review_status not null default 'pending',
  feedback     text,
  reviewed_by  uuid references auth.users(id) on delete set null,
  reviewed_at  timestamptz,
  submitted_at timestamptz not null default now(),
  unique (student_id, report_date)
);
create index on public.daily_reports (status, submitted_at);

-- ===== persisted achievements and certificates (written only by database functions) =====
create table public.student_badges (
  student_id  uuid not null references public.students(id) on delete cascade,
  badge_id    uuid not null references public.badge_definitions(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (student_id, badge_id)
);

create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  certificate_number text not null unique,
  student_id         uuid not null references public.students(id) on delete cascade,
  badge_id           uuid not null references public.badge_definitions(id) on delete cascade,
  student_name       text not null,   -- snapshots: a certificate stays stable if names are edited later
  badge_name         text not null,
  verified_projects  int  not null,
  issued_at          timestamptz not null default now(),
  revoked_at         timestamptz,
  revoke_reason      text,
  unique (student_id, badge_id)
);

-- ===== helpers =====
create or replace function public.current_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid();
$$;
create or replace function public.my_class_id() returns uuid
language sql stable security definer set search_path = public as $$
  select b.class_id from public.students s join public.batches b on b.id = s.batch_id where s.user_id = auth.uid();
$$;
create or replace function public.my_batch_id() returns uuid
language sql stable security definer set search_path = public as $$
  select batch_id from public.students where user_id = auth.uid();
$$;

create or replace function public._slugify(t text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')), ''), 'student');
$$;

-- ===== progress (computed in the database, never trusted from the client) =====
-- Approved submissions are consumed sequentially: the first badge takes its required count, the
-- remainder flows to the next badge, and so on. Only status = 'approved' counts.
create or replace function public._student_progress(p_student uuid)
returns table (
  badge_id uuid, level public.badge_level, name text, "position" int, required int,
  certificate_eligible boolean, counted int, percent int, state text,
  unlocked_at timestamptz, reached boolean, enrolled boolean
)
language sql stable security definer set search_path = public as $$
  with s as (
    select st.id,
      (st.profile_completed_at is not null and exists (
         select 1 from public.batches b join public.classes c on c.id = b.class_id
         where b.id = st.batch_id and b.is_active and c.is_active)) as enrolled,
      (select count(*)::int from public.submissions x where x.student_id = st.id and x.status = 'approved') as n
    from public.students st where st.id = p_student
  ), d as (
    select bd.*, coalesce(sum(bd.required_projects) over (order by bd.position
             rows between unbounded preceding and 1 preceding), 0)::int as prior
    from public.badge_definitions bd where bd.is_active
  ), c as (
    select d.id, d.level, d.name, d.position, d.required_projects as req, d.certificate_eligible,
           least(greatest(s.n - d.prior, 0), d.required_projects) as live, sb.unlocked_at, s.enrolled
    from d cross join s
    left join public.student_badges sb on sb.badge_id = d.id and sb.student_id = s.id
  ), f as (select min(c.position) as p from c where c.unlocked_at is null)
  select c.id, c.level, c.name, c.position, c.req, c.certificate_eligible,
         case when c.unlocked_at is not null then c.req else c.live end,
         round(100.0 * (case when c.unlocked_at is not null then c.req else c.live end) / c.req)::int,
         case when c.unlocked_at is not null then 'completed'
              when c.enrolled and c.position = (select p from f) then 'active'
              else 'locked' end,
         c.unlocked_at, (c.live >= c.req), c.enrolled
  from c order by c.position;
$$;

-- Persists achievements, issues certificates, keeps students.badge in step.
-- p_allow_revoke: only true when an approval was withdrawn (never on a config change).
create or replace function public._sync_student_progress(p_student uuid, p_allow_revoke boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_name text;
begin
  select name into v_name from public.students where id = p_student;
  if v_name is null then return; end if;

  if p_allow_revoke then
    for r in select * from public._student_progress(p_student) where unlocked_at is not null and not reached loop
      delete from public.student_badges where student_id = p_student and badge_id = r.badge_id;
      update public.certificates set revoked_at = now(), revoke_reason = 'An approved project was withdrawn'
        where student_id = p_student and badge_id = r.badge_id and revoked_at is null;
    end loop;
  end if;

  for r in select * from public._student_progress(p_student) where unlocked_at is null and reached order by "position" loop
    insert into public.student_badges (student_id, badge_id) values (p_student, r.badge_id) on conflict do nothing;
    if r.certificate_eligible then
      insert into public.certificates (certificate_number, student_id, badge_id, student_name, badge_name, verified_projects)
      values ('CERT-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
              p_student, r.badge_id, v_name, r.name, r.required)
      on conflict (student_id, badge_id) do update
        set revoked_at = null, revoke_reason = null, issued_at = now(), student_name = excluded.student_name,
            badge_name = excluded.badge_name, verified_projects = excluded.verified_projects;
    end if;
  end loop;

  update public.students s set badge = (
      select bd.level from public.student_badges sb join public.badge_definitions bd on bd.id = sb.badge_id
      where sb.student_id = p_student order by bd.position desc limit 1)
    where s.id = p_student and s.user_id is not null;
end $$;

create or replace function public._submissions_sync_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then perform public._sync_student_progress(new.student_id, false); end if;
  elsif tg_op = 'UPDATE' then
    if old.status is distinct from new.status then
      perform public._sync_student_progress(new.student_id, old.status = 'approved' and new.status <> 'approved');
    end if;
  elsif tg_op = 'DELETE' then
    if old.status = 'approved' then perform public._sync_student_progress(old.student_id, true); end if;
    return old;
  end if;
  return new;
end $$;
create trigger submissions_sync after insert or update or delete on public.submissions
  for each row execute function public._submissions_sync_trg();

create or replace function public._touch_review() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;
create trigger submissions_touch before update on public.submissions
  for each row execute function public._touch_review();

-- ===== student registration: an auth user created through the student form gets a student row =====
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_id uuid;
begin
  if coalesce(new.raw_user_meta_data->>'registration', '') <> 'student' then return new; end if;
  v_name := left(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 120);
  if v_name is null then v_name := split_part(new.email, '@', 1); end if;
  insert into public.students (slug, name, user_id, badge)
  values (public._slugify(v_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6), v_name, new.id, null)
  returning id into v_id;
  insert into public.student_private (student_id, email) values (v_id, new.email) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Deleting a student record also removes its login, so a deleted student cannot sign in to nothing.
create or replace function public._delete_student_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.user_id is not null then delete from auth.users where id = old.user_id; end if;
  return old;
end $$;
create trigger students_delete_login after delete on public.students
  for each row execute function public._delete_student_login();
revoke all on function public._delete_student_login() from public, anon, authenticated;

-- save_student: admin edits must not overwrite the computed badge of a registered student.
create or replace function public.save_student(student jsonb, projects jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid     uuid;
  p       jsonb;
  idx     int := 0;
  v_email text := nullif(trim(student->>'email'), '');
  v_skills text[] := coalesce(array(select jsonb_array_elements_text(coalesce(student->'skills', '[]'::jsonb))), '{}');
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  sid := nullif(student->>'id', '')::uuid;

  if sid is null then
    insert into public.students (slug, name, image_url, image_public_id, track, badge, skills)
    values (
      student->>'slug', student->>'name', student->>'image_url', student->>'image_public_id',
      (student->>'track')::public.track, (student->>'badge')::public.badge_level, v_skills
    )
    returning id into sid;
  else
    -- slug is intentionally NOT updated: shared links must keep working
    update public.students set
      name            = student->>'name',
      image_url       = student->>'image_url',
      image_public_id = student->>'image_public_id',
      track           = (student->>'track')::public.track,
      badge           = case when user_id is not null then badge else (student->>'badge')::public.badge_level end,
      skills          = v_skills
    where id = sid;
    if not found then
      raise exception 'student not found' using errcode = 'P0002';
    end if;
    delete from public.projects where student_id = sid;
  end if;

  if v_email is null then
    delete from public.student_private where student_id = sid;
  else
    insert into public.student_private (student_id, email) values (sid, v_email)
    on conflict (student_id) do update set email = excluded.email;
  end if;

  for p in select * from jsonb_array_elements(coalesce(projects, '[]'::jsonb)) loop
    insert into public.projects (student_id, title, type, solo, stack, link, position)
    values (
      sid, p->>'title', (p->>'type')::public.project_type, coalesce((p->>'solo')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
      nullif(p->>'link', ''), idx
    );
    idx := idx + 1;
  end loop;

  return sid;
end;
$$;

-- ===== student RPCs (all identity comes from auth.uid(), never from parameters) =====
create or replace function public.update_my_profile(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.current_student_id();
  v_name text := left(trim(p->>'name'), 120);
  v_track public.track := (p->>'track')::public.track;
  v_batch uuid := nullif(p->>'batch_id', '')::uuid;
begin
  if sid is null then raise exception 'not a student account' using errcode = '42501'; end if;
  if v_name is null or v_name = '' then raise exception 'Name is required'; end if;
  if v_batch is null then raise exception 'Choose your batch'; end if;
  if not exists (select 1 from public.batches b join public.classes c on c.id = b.class_id
                 where b.id = v_batch and b.is_active and c.is_active) then
    raise exception 'That batch is not open for enrolment';
  end if;
  update public.students set
    name = v_name, track = v_track, batch_id = v_batch,
    bio = nullif(left(trim(coalesce(p->>'bio', '')), 1000), ''),
    skills = coalesce(array(select jsonb_array_elements_text(coalesce(p->'skills', '[]'::jsonb))), '{}'),
    image_url = case when p ? 'image_url' then p->>'image_url' else image_url end,
    image_public_id = case when p ? 'image_public_id' then p->>'image_public_id' else image_public_id end,
    profile_completed_at = coalesce(profile_completed_at, now())
  where id = sid;
end $$;

create or replace function public._check_attachments(a jsonb, min_n int) returns jsonb
language plpgsql immutable as $$
declare e jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'array' then a := '[]'::jsonb; end if;
  if jsonb_array_length(a) < min_n then raise exception 'Attach at least % image(s) as evidence', min_n; end if;
  if jsonb_array_length(a) > 6 then raise exception 'At most 6 attachments'; end if;
  for e in select * from jsonb_array_elements(a) loop
    if coalesce(e->>'url', '') !~ '^https://' or coalesce(e->>'public_id', '') = '' then
      raise exception 'Invalid attachment';
    end if;
  end loop;
  return a;
end $$;

create or replace function public._require_ready_student() returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := public.current_student_id(); ok boolean;
begin
  if sid is null then raise exception 'not a student account' using errcode = '42501'; end if;
  select enrolled into ok from public._student_progress(sid) limit 1;
  if not coalesce(ok, false) then raise exception 'Complete your profile and enrol in an active batch first'; end if;
  return sid;
end $$;

create or replace function public.submit_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student(); v_id uuid;
begin
  insert into public.submissions (student_id, task_id, title, description, type, stack, link, attachments)
  values (sid, nullif(p->>'task_id', '')::uuid, left(trim(p->>'title'), 120), nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
          coalesce((p->>'type')::public.project_type, 'mini'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
          nullif(trim(coalesce(p->>'link', '')), ''), public._check_attachments(p->'attachments', 1))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.resubmit_project(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student();
begin
  update public.submissions set
    title = left(trim(p->>'title'), 120), description = nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
    type = coalesce((p->>'type')::public.project_type, type),
    stack = coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
    link = nullif(trim(coalesce(p->>'link', '')), ''), attachments = public._check_attachments(p->'attachments', 1),
    status = 'pending', reviewed_by = null, reviewed_at = null, resubmit_count = resubmit_count + 1, submitted_at = now()
  where id = p_id and student_id = sid and status = 'rejected';
  if not found then raise exception 'Only your rejected submissions can be resubmitted'; end if;
end $$;

create or replace function public.submit_daily_report(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public._require_ready_student(); v_id uuid;
  v_date date := coalesce(nullif(p->>'report_date', '')::date, current_date);
  v_hours numeric := nullif(p->>'hours_spent', '')::numeric;
  v_att jsonb := public._check_attachments(coalesce(p->'attachments', '[]'::jsonb), 0);
begin
  if v_date > current_date then raise exception 'Report date cannot be in the future'; end if;
  update public.daily_reports set
    summary = left(trim(p->>'summary'), 4000), hours_spent = v_hours, blockers = nullif(left(trim(coalesce(p->>'blockers', '')), 2000), ''),
    attachments = v_att, status = 'pending', reviewed_by = null, reviewed_at = null, submitted_at = now()
  where student_id = sid and report_date = v_date and status = 'rejected'
  returning id into v_id;
  if v_id is not null then return v_id; end if;
  insert into public.daily_reports (student_id, report_date, summary, hours_spent, blockers, attachments)
  values (sid, v_date, left(trim(p->>'summary'), 4000), v_hours, nullif(left(trim(coalesce(p->>'blockers', '')), 2000), ''), v_att)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.my_progress()
returns table (badge_id uuid, level public.badge_level, name text, "position" int, required int,
               certificate_eligible boolean, counted int, percent int, state text, unlocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select badge_id, level, name, "position", required, certificate_eligible, counted, percent, state, unlocked_at
  from public._student_progress(public.current_student_id());
$$;

-- ===== admin RPCs =====
create or replace function public.admin_student_progress(p_student uuid)
returns table (badge_id uuid, level public.badge_level, name text, "position" int, required int,
               certificate_eligible boolean, counted int, percent int, state text, unlocked_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return query select x.badge_id, x.level, x.name, x."position", x.required, x.certificate_eligible, x.counted, x.percent, x.state, x.unlocked_at
               from public._student_progress(p_student) x;
end $$;

create or replace function public.review_item(p_kind text, p_id uuid, p_decision public.review_status, p_feedback text)
returns void language plpgsql security definer set search_path = public as $$
declare v_fb text := nullif(left(trim(coalesce(p_feedback, '')), 2000), ''); n int;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_decision = 'pending' then raise exception 'Decision must be approved or rejected'; end if;
  if p_decision = 'rejected' and v_fb is null then raise exception 'Feedback is required when rejecting'; end if;
  if p_kind = 'submission' then
    update public.submissions set status = p_decision, feedback = v_fb, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_id and status <> p_decision;
  elsif p_kind = 'report' then
    update public.daily_reports set status = p_decision, feedback = v_fb, reviewed_by = auth.uid(), reviewed_at = now()
      where id = p_id and status <> p_decision;
  else
    raise exception 'Unknown item kind';
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Item not found or already in that state'; end if;
end $$;

-- Saves the whole badge ladder atomically, then re-evaluates every student (never revokes).
-- rules = [ { id?, level, name, position, required_projects, certificate_eligible, is_active } ]
create or replace function public.save_badge_rules(rules jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb; sid uuid;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  for r in select * from jsonb_array_elements(rules) loop
    update public.badge_definitions set
      name = left(trim(r->>'name'), 60), position = (r->>'position')::int,
      required_projects = (r->>'required_projects')::int,
      certificate_eligible = (r->>'certificate_eligible')::boolean, is_active = (r->>'is_active')::boolean
    where level = (r->>'level')::public.badge_level;
  end loop;
  for sid in select id from public.students where user_id is not null loop
    perform public._sync_student_progress(sid, false);
  end loop;
end $$;

-- ===== public certificate verification (non-sensitive fields only) =====
create or replace function public.verify_certificate(p_number text)
returns table (certificate_number text, student_name text, badge_name text, verified_projects int,
               issued_at timestamptz, valid boolean, revoked_at timestamptz, org_name text)
language sql stable security definer set search_path = public as $$
  select c.certificate_number, c.student_name, c.badge_name, c.verified_projects, c.issued_at,
         c.revoked_at is null, c.revoked_at, o.org_name
  from public.certificates c cross join public.organization_settings o
  where c.certificate_number = upper(trim(p_number));
$$;

-- ===== function privileges: internal helpers are not callable through the API =====
revoke all on function public._student_progress(uuid), public._sync_student_progress(uuid, boolean),
  public._submissions_sync_trg(), public._require_ready_student(), public.handle_new_user() from public, anon, authenticated;
revoke all on function public.update_my_profile(jsonb), public.submit_project(jsonb), public.resubmit_project(uuid, jsonb),
  public.submit_daily_report(jsonb), public.my_progress(), public.admin_student_progress(uuid),
  public.review_item(text, uuid, public.review_status, text), public.save_badge_rules(jsonb) from public, anon;
grant execute on function public.update_my_profile(jsonb), public.submit_project(jsonb), public.resubmit_project(uuid, jsonb),
  public.submit_daily_report(jsonb), public.my_progress(), public.admin_student_progress(uuid),
  public.review_item(text, uuid, public.review_status, text), public.save_badge_rules(jsonb) to authenticated;
grant execute on function public.verify_certificate(text) to anon, authenticated;

-- ===== public view of approved projects (no evidence files, no feedback) =====
create view public.public_student_projects as
  select s.id, s.student_id, s.title, s.type, true as solo, s.stack, s.link, s.submitted_at
  from public.submissions s
  join public.students st on st.id = s.student_id
  where s.status = 'approved' and (st.user_id is null or st.profile_completed_at is not null);
grant select on public.public_student_projects to anon, authenticated;

-- ===== RLS =====
alter table public.organization_settings enable row level security;
alter table public.classes          enable row level security;
alter table public.batches          enable row level security;
alter table public.tasks            enable row level security;
alter table public.lab_manuals      enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.submissions      enable row level security;
alter table public.daily_reports    enable row level security;
alter table public.student_badges   enable row level security;
alter table public.certificates     enable row level security;

-- Public board: legacy rows and completed self-registered profiles only (plus the owner and admins).
drop policy if exists "public read students" on public.students;
create policy "read visible students" on public.students for select
  using (user_id is null or profile_completed_at is not null or user_id = auth.uid() or public.is_admin());

create policy "public read org" on public.organization_settings for select using (true);
create policy "admin write org" on public.organization_settings for all using (public.is_admin()) with check (public.is_admin());

create policy "public read classes" on public.classes for select using (is_active or public.is_admin());
create policy "admin write classes" on public.classes for all using (public.is_admin()) with check (public.is_admin());
create policy "public read batches" on public.batches for select using (is_active or public.is_admin());
create policy "admin write batches" on public.batches for all using (public.is_admin()) with check (public.is_admin());

create policy "students read own tasks" on public.tasks for select
  using (public.is_admin() or (is_active and class_id = public.my_class_id() and (batch_id is null or batch_id = public.my_batch_id())));
create policy "admin write tasks" on public.tasks for all using (public.is_admin()) with check (public.is_admin());
create policy "students read own manuals" on public.lab_manuals for select
  using (public.is_admin() or (class_id = public.my_class_id() and (batch_id is null or batch_id = public.my_batch_id())));
create policy "admin write manuals" on public.lab_manuals for all using (public.is_admin()) with check (public.is_admin());

create policy "public read badge rules" on public.badge_definitions for select using (true);
create policy "admin write badge rules" on public.badge_definitions for all using (public.is_admin()) with check (public.is_admin());

-- Students only READ their own rows. Every student write goes through the RPCs above.
create policy "read own submissions" on public.submissions for select using (student_id = public.current_student_id() or public.is_admin());
create policy "admin write submissions" on public.submissions for all using (public.is_admin()) with check (public.is_admin());
create policy "read own reports" on public.daily_reports for select using (student_id = public.current_student_id() or public.is_admin());
create policy "admin write reports" on public.daily_reports for all using (public.is_admin()) with check (public.is_admin());
create policy "read own badges" on public.student_badges for select using (student_id = public.current_student_id() or public.is_admin());
create policy "read own certificates" on public.certificates for select using (student_id = public.current_student_id() or public.is_admin());
create policy "admin revoke certificates" on public.certificates for update using (public.is_admin()) with check (public.is_admin());

revoke all on public.submissions, public.daily_reports, public.student_badges, public.certificates,
  public.tasks, public.lab_manuals from anon;
revoke insert, update, delete on public.student_badges, public.certificates from authenticated;
grant update (revoked_at, revoke_reason) on public.certificates to authenticated;
