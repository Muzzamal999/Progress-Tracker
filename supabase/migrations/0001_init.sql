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
