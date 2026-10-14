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

-- test admin created via the Auth API
insert into public.admin_users (user_id) values ('f253c664-67f5-40f4-98fb-18f06fcd0862') on conflict do nothing;
